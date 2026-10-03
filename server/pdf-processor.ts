import fs from 'fs';
import zlib from 'zlib';
import { safeLogger } from './error-handler.js';

export interface PDFChunk {
  index: number;
  text: string;
  page?: number;
}

export interface PDFProcessingResult {
  isValid: boolean;
  error?: string;
  hasText: boolean;
  isScanned?: boolean;
  pageCount: number;
  textLength: number;
  extractedText: string;
  chunks: PDFChunk[];
  summaryPreview?: string;
}

/**
 * Validates whether the file is a legitimate PDF by inspecting its header signature
 */
export function validatePDFHeader(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(1024);
    const bytesRead = fs.readSync(fd, buffer, 0, 1024, 0);
    fs.closeSync(fd);
    const header = buffer.slice(0, bytesRead).toString('latin1');
    return header.includes('%PDF-');
  } catch {
    return false;
  }
}

/**
 * Native fallback PDF text extractor using Node's built-in zlib and PDF text operator parsing.
 * Handles FlateDecode compressed streams as well as uncompressed PDF text streams.
 */
export function extractPDFTextNativeFallback(dataBuffer: Buffer): { text: string; pageCount: number } {
  try {
    const rawLatin1 = dataBuffer.toString('latin1');
    const pageMatches = rawLatin1.match(/\/Type\s*\/Page\b/g);
    const estimatedPages = pageMatches ? Math.max(1, pageMatches.length) : 1;

    const extractedSegments: string[] = [];

    const decodePdfLiteral = (literal: string): string => {
      return literal
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\')
        .replace(/\\([0-7]{1,3})/g, (_m, oct) => String.fromCharCode(parseInt(oct, 8)));
    };

    const decodePdfHex = (hexStr: string): string => {
      const cleanHex = hexStr.replace(/\s+/g, '');
      if (cleanHex.length === 0) return '';
      // Check UTF-16BE BOM (FEFF) or 2-byte big-endian characters
      if (cleanHex.toUpperCase().startsWith('FEFF') || cleanHex.length % 4 === 0) {
        let out = '';
        for (let i = 0; i < cleanHex.length; i += 4) {
          if (i + 4 <= cleanHex.length) {
            const code = parseInt(cleanHex.slice(i, i + 4), 16);
            if (!isNaN(code) && code !== 0xfeff && code > 0) {
              out += String.fromCharCode(code);
            }
          }
        }
        if (out.trim().length > 0) return out;
      }
      let out = '';
      for (let i = 0; i < cleanHex.length; i += 2) {
        const code = parseInt(cleanHex.slice(i, i + 2), 16);
        if (!isNaN(code) && code >= 32) {
          out += String.fromCharCode(code);
        }
      }
      return out;
    };

    const parseContentStreamText = (streamContent: string) => {
      // Extract text inside BT ... ET blocks or general Tj / TJ operators
      const tjSingleRegex = /\((?:\\.|[^\\()])*\)\s*Tj/g;
      let match: RegExpExecArray | null;
      while ((match = tjSingleRegex.exec(streamContent)) !== null) {
        const inner = match[0].replace(/\)\s*Tj$/, '').slice(1);
        const decoded = decodePdfLiteral(inner);
        if (decoded.trim()) extractedSegments.push(decoded);
      }

      const tjArrayRegex = /\[((?:[^\[\]]|\((?:\\.|[^\\()])*\))*)\]\s*TJ/g;
      while ((match = tjArrayRegex.exec(streamContent)) !== null) {
        const arrBody = match[1];
        let line = '';
        const tokenRegex = /\((?:\\.|[^\\()])*\)|<([0-9A-Fa-f\s]+)>/g;
        let tok: RegExpExecArray | null;
        while ((tok = tokenRegex.exec(arrBody)) !== null) {
          if (tok[0].startsWith('(')) {
            line += decodePdfLiteral(tok[0].slice(1, -1));
          } else if (tok[1]) {
            line += decodePdfHex(tok[1]);
          }
        }
        if (line.trim()) extractedSegments.push(line);
      }
    };

    // Scan all stream ... endstream blocks
    let searchPos = 0;
    const maxStreams = 400;
    let streamCount = 0;

    while (streamCount < maxStreams) {
      const streamIdx = rawLatin1.indexOf('stream', searchPos);
      if (streamIdx === -1) break;

      const endStreamIdx = rawLatin1.indexOf('endstream', streamIdx + 6);
      if (endStreamIdx === -1) break;

      searchPos = endStreamIdx + 9;
      streamCount++;

      let dataStart = streamIdx + 6;
      if (rawLatin1[dataStart] === '\r' && rawLatin1[dataStart + 1] === '\n') {
        dataStart += 2;
      } else if (rawLatin1[dataStart] === '\n' || rawLatin1[dataStart] === '\r') {
        dataStart += 1;
      }

      let dataEnd = endStreamIdx;
      if (rawLatin1[dataEnd - 2] === '\r' && rawLatin1[dataEnd - 1] === '\n') {
        dataEnd -= 2;
      } else if (rawLatin1[dataEnd - 1] === '\n' || rawLatin1[dataEnd - 1] === '\r') {
        dataEnd -= 1;
      }

      if (dataEnd <= dataStart || dataEnd - dataStart > 5 * 1024 * 1024) continue;

      const slice = dataBuffer.subarray(dataStart, dataEnd);
      let decompressed: string | null = null;

      try {
        decompressed = zlib.inflateSync(slice).toString('latin1');
      } catch {
        try {
          decompressed = zlib.inflateRawSync(slice).toString('latin1');
        } catch {
          // Might be an uncompressed content stream
          const rawStr = slice.toString('latin1');
          if (rawStr.includes('Tj') || rawStr.includes('TJ')) {
            decompressed = rawStr;
          }
        }
      }

      if (decompressed && (decompressed.includes('Tj') || decompressed.includes('TJ'))) {
        parseContentStreamText(decompressed);
      }
    }

    return {
      text: extractedSegments.join(' ').replace(/\s+/g, ' ').trim(),
      pageCount: estimatedPages,
    };
  } catch {
    return { text: '', pageCount: 1 };
  }
}

/**
 * Extracts text from a PDF Buffer (supports pdf-parse v2 class, pdf-parse v1 function, and native stream fallback)
 */
export async function extractTextFromPDFBuffer(dataBuffer: Buffer): Promise<{ text: string; pageCount: number }> {
  let rawText = '';
  let pageCount = 1;

  try {
    const parsePromise = (async () => {
      const mod: any = await import('pdf-parse');
      // 1. Check pdf-parse v2 API (PDFParse class)
      if (mod && typeof mod.PDFParse === 'function') {
        const parser = new mod.PDFParse({ data: new Uint8Array(dataBuffer) });
        const textResult = await parser.getText();
        try {
          await parser.destroy?.();
        } catch {}
        return {
          text: textResult?.text || '',
          numpages: textResult?.total || textResult?.pages?.length || 1,
        };
      }
      // 2. Check pdf-parse v1 API (default function export)
      const parseFn = mod?.default || mod;
      if (typeof parseFn === 'function') {
        return await parseFn(dataBuffer);
      }
      return null;
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PDF parsing timed out')), 10000)
    );

    const pdfData: any = await Promise.race([parsePromise, timeoutPromise]);
    if (pdfData && typeof pdfData.text === 'string' && pdfData.text.trim().length > 0) {
      rawText = pdfData.text;
      pageCount = pdfData.numpages || 1;
    }
  } catch (parseErr: any) {
    console.warn('pdf-parse notice, trying native PDF stream fallback:', parseErr?.message);
  }

  if (!rawText || rawText.trim().length < 15) {
    const fallback = extractPDFTextNativeFallback(dataBuffer);
    if (fallback.text && fallback.text.length > rawText.trim().length) {
      rawText = fallback.text;
      pageCount = fallback.pageCount || pageCount;
    }
  }

  return { text: rawText, pageCount };
}

/**
 * Extracts and structures text from a PDF file
 */
export async function processPDFFile(filePath: string): Promise<PDFProcessingResult> {
  if (!fs.existsSync(filePath)) {
    return {
      isValid: false,
      error: 'File does not exist on the server.',
      hasText: false,
      pageCount: 0,
      textLength: 0,
      extractedText: '',
      chunks: [],
    };
  }

  try {
    const dataBuffer = fs.readFileSync(filePath);
    const { text: extractedRaw, pageCount: rawPageCount } = await extractTextFromPDFBuffer(dataBuffer);

    // Bound raw text to 250,000 characters
    const boundedRawText = (extractedRaw || '').slice(0, 250000).trim();
    const pageCount = rawPageCount || (boundedRawText ? Math.max(1, Math.ceil(boundedRawText.length / 2500)) : 1);

    // Clean up excessive whitespace and null bytes on bounded string
    const cleanedText = boundedRawText
      .replace(/\0/g, '')
      .replace(/[\r\f]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    // Check if the PDF is scanned / image-only (no extractable text layer)
    const meaningfulText = cleanedText.replace(/[\s\d\W]+/g, '');
    if (!cleanedText || meaningfulText.length < 10) {
      return {
        isValid: true,
        hasText: false,
        isScanned: true,
        pageCount,
        textLength: 0,
        extractedText: '',
        chunks: [],
        summaryPreview: 'This PDF appears to be a scanned image or visual PDF.',
      };
    }

    const chunks = createTextChunks(cleanedText, pageCount);
    const summaryPreview = cleanedText.slice(0, 300) + (cleanedText.length > 300 ? '...' : '');

    return {
      isValid: true,
      hasText: true,
      isScanned: false,
      pageCount,
      textLength: cleanedText.length,
      extractedText: cleanedText,
      chunks,
      summaryPreview,
    };
  } catch (err: any) {
    safeLogger.error('Failed to process PDF:', err);
    return {
      isValid: false,
      error: 'PDF extraction failed. The document could not be processed.',
      hasText: false,
      pageCount: 0,
      textLength: 0,
      extractedText: '',
      chunks: [],
    };
  }
}

/**
 * Splits document text into overlapping chunks with boundaries on paragraphs and sentences
 */
export function createTextChunks(fullText: string, totalPages = 1, targetChunkSize = 1400, overlap = 220): PDFChunk[] {
  if (!fullText || !fullText.trim()) return [];
  if (fullText.length <= targetChunkSize) {
    return [{ index: 0, text: fullText, page: 1 }];
  }

  const chunks: PDFChunk[] = [];
  const paragraphs = fullText.split(/\n\n+/);
  let currentChunk = '';
  let chunkIndex = 0;
  const charsPerPage = Math.max(1000, Math.floor(fullText.length / Math.max(1, totalPages)));

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    if (currentChunk.length + trimmedPara.length > targetChunkSize && currentChunk.length > 0) {
      const approxCharPosition = chunks.reduce((acc, c) => acc + c.text.length, 0);
      const approxPage = Math.min(totalPages, Math.max(1, Math.ceil(approxCharPosition / charsPerPage)));

      chunks.push({
        index: chunkIndex++,
        text: currentChunk.trim(),
        page: approxPage,
      });

      const overlapText = currentChunk.slice(Math.max(0, currentChunk.length - overlap));
      currentChunk = overlapText + '\n\n' + trimmedPara;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
    }
  }

  if (currentChunk.trim().length > 0) {
    const approxPage = totalPages;
    chunks.push({
      index: chunkIndex++,
      text: currentChunk.trim(),
      page: approxPage,
    });
  }

  return chunks;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'about', 'as', 'into', 'like', 'through', 'after', 'over', 'between',
  'out', 'against', 'during', 'without', 'before', 'under', 'around', 'among',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'what',
  'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how', 'all', 'any',
  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'just', 'tell', 'me',
  'please', 'find', 'explain', 'give', 'show', 'summarize', 'summary', 'describe',
  'file', 'pdf', 'zip', 'document', 'ki', 'ache', 'moddhe', 'bol', 'bolo', 'dao',
]);

/**
 * Retrieves the top relevant chunks for a specific query using TF-IDF token matching
 */
export function retrieveRelevantChunks(query: string, chunks: PDFChunk[], maxChunks = 6): PDFChunk[] {
  if (!chunks || chunks.length === 0) return [];
  if (chunks.length <= maxChunks) return chunks;

  const isGeneralSummary = /^(summarize|summary|what is this|overview|main points|explain|describe|ki ache|ki bola hoyeche)/i.test(query.trim());
  if (isGeneralSummary) {
    const selected: PDFChunk[] = [];
    selected.push(chunks[0]);
    if (chunks.length > 3) {
      selected.push(chunks[1]);
    }
    if (chunks.length > 2) {
      selected.push(chunks[Math.floor(chunks.length / 2)]);
    }
    if (chunks.length > 1) {
      selected.push(chunks[chunks.length - 1]);
    }
    return selected;
  }

  // Tokenize query (supports English, numbers, and Bengali script)
  const queryTokens = query
    .toLowerCase()
    .replace(/[^\w\s\u0980-\u09FF]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

  if (queryTokens.length === 0) {
    return chunks.slice(0, maxChunks);
  }

  const scoredChunks = chunks.map((chunk) => {
    const chunkTextLower = chunk.text.toLowerCase();
    let score = 0;

    for (const token of queryTokens) {
      if (chunkTextLower.includes(token)) {
        const occurrences = chunkTextLower.split(token).length - 1;
        score += occurrences * 3 + 2;
      }
    }

    return { chunk, score };
  });

  scoredChunks.sort((a, b) => b.score - a.score);

  const topScored = scoredChunks
    .filter((item) => item.score > 0)
    .slice(0, maxChunks)
    .map((item) => item.chunk);

  if (topScored.length === 0) {
    return chunks.slice(0, maxChunks);
  }

  // Always include first chunk if room permits so document header/overview is preserved
  if (!topScored.some((c) => c.index === 0) && topScored.length < maxChunks) {
    topScored.unshift(chunks[0]);
  }

  return topScored.sort((a, b) => a.index - b.index);
}
