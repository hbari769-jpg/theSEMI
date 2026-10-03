import multer from 'multer';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import crypto from 'crypto';
import { db, FileRecord } from './db.js';
import { processPDFFile, extractTextFromPDFBuffer, createTextChunks } from './pdf-processor.js';
import { uploadToSupabaseStorage, deleteFromSupabaseStorage, generateStoragePath } from './supabase-storage.js';
import { safeLogger } from './error-handler.js';

export const UPLOADS_DIR = path.resolve('uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ==========================================
// STRICT WHITELISTS & SECURITY LIMITS
// ==========================================

// Dangerous OS executable binary extensions that must be blocked
export const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.msi', '.vbs', '.vbe', '.ps1', '.psm1',
  '.scr', '.com', '.pif', '.elf', '.so', '.dylib', '.cgi', '.htaccess', '.htpasswd'
]);

export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml'
]);
export const ALLOWED_IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg'
]);

export const ALLOWED_AUDIO_MIMES = new Set([
  'audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a',
  'audio/x-m4a', 'audio/mp4', 'audio/flac', 'audio/aac', 'audio/x-wav'
]);
export const ALLOWED_AUDIO_EXTS = new Set([
  '.webm', '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'
]);

export const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg', 'video/ogg', 'video/x-matroska', 'video/avi', 'video/x-msvideo'
]);
export const ALLOWED_VIDEO_EXTS = new Set([
  '.mp4', '.webm', '.mov', '.mpeg', '.mkv', '.avi', '.ogg'
]);

export const ALLOWED_ARCHIVE_EXTS = new Set([
  '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.jar', '.epub'
]);

export const ALLOWED_OFFICE_EXTS = new Set([
  '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt', '.odt', '.ods', '.odp', '.rtf'
]);

export const ALLOWED_DOC_EXTS = new Set([
  '.pdf', '.zip', '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt', '.odt', '.ods', '.odp', '.rtf',
  '.tar', '.gz', '.tgz', '.7z', '.rar', '.epub',
  '.txt', '.md', '.markdown', '.json', '.csv', '.tsv', '.js', '.jsx', '.ts', '.tsx',
  '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.php', '.rb',
  '.html', '.htm', '.css', '.scss', '.sass', '.less', '.sql', '.yaml', '.yml',
  '.xml', '.sh', '.bash', '.zsh', '.env', '.log', '.ini', '.cfg', '.conf', '.toml',
  '.dockerfile', '.graphql', '.proto', '.swift', '.kt', '.r', '.m', '.tex', '.vue', '.svelte', '.astro', '.prisma'
]);

// Granular Size Limits
export const MAX_TOTAL_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_IMAGE_SIZE = 25 * 1024 * 1024;       // 25MB
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024;       // 25MB
export const MAX_VIDEO_SIZE = 35 * 1024 * 1024;       // 35MB
export const MAX_DOC_SIZE = 50 * 1024 * 1024;         // 50MB

/**
 * Validates file extension and ensures safety against executable binaries.
 * Supports ZIP, PDF, Office documents, images, audio, video, code, data, and general user files.
 */
export function validateExtensionAndMime(ext: string, mime: string): { isValid: boolean; error?: string } {
  const cleanExt = (ext || '').toLowerCase().trim();
  const cleanMime = (mime || '').toLowerCase().trim();

  // Explicitly blocked executable extensions
  if (cleanExt && BLOCKED_EXTENSIONS.has(cleanExt)) {
    return { isValid: false, error: `Security Violation: File extension '${cleanExt}' is prohibited.` };
  }

  if (
    cleanMime.includes('dosexec') ||
    cleanMime.includes('x-msdownload') ||
    cleanMime.includes('x-executable')
  ) {
    return { isValid: false, error: `Dangerous executable MIME type '${cleanMime}' is prohibited.` };
  }

  return { isValid: true };
}

/**
 * Validates the binary header / magic bytes of an uploaded file on disk.
 * Blocks native OS executables (PE/ELF/Mach-O) while allowing PDFs, ZIPs, Office files, media, and documents.
 */
export function validateFileMagicBytes(filePath: string, _ext: string, _mime: string): { isValid: boolean; error?: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { isValid: false, error: 'File does not exist on disk.' };
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      return { isValid: false, error: 'Empty file uploaded. File size must be greater than zero bytes.' };
    }

    const buffer = Buffer.alloc(Math.min(512, stat.size));
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    // Block Windows PE / MZ executables ('MZ' 0x4D 0x5A)
    if (buffer.length >= 2 && buffer[0] === 0x4D && buffer[1] === 0x5A) {
      return { isValid: false, error: 'Security Violation: Windows executable / DLL binary signatures are strictly prohibited.' };
    }
    // Block Linux ELF executables (0x7F 'E' 'L' 'F')
    if (buffer.length >= 4 && buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) {
      return { isValid: false, error: 'Security Violation: Linux ELF binary signatures are strictly prohibited.' };
    }

    return { isValid: true };
  } catch (err: any) {
    console.error('Magic bytes validation error:', err);
    return { isValid: false, error: 'Failed to inspect file binary signatures.' };
  }
}

interface ZipEntryData {
  name: string;
  isDirectory: boolean;
  compressedSize: number;
  uncompressedSize: number;
  data: Buffer;
}

/**
 * Decodes XML entities into plain readable characters
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16) || 32))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10) || 32));
}

/**
 * Native Node.js ZIP Archive Parser using Central Directory + Local File Header fallback.
 * Decompresses stored (0) and deflated (8) entries using built-in zlib.
 */
export function parseZipEntries(zipBuffer: Buffer, maxEntries = 120): ZipEntryData[] {
  const entries: ZipEntryData[] = [];
  const seenNames = new Set<string>();

  try {
    // 1. Locate End of Central Directory (EOCD: 0x06054b50)
    let eocdOffset = -1;
    const minEocdSearch = Math.max(0, zipBuffer.length - 65557);
    for (let i = zipBuffer.length - 22; i >= minEocdSearch; i--) {
      if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset !== -1 && eocdOffset + 20 <= zipBuffer.length) {
      const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
      const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
      let ptr = cdOffset;

      for (let idx = 0; idx < totalEntries && entries.length < maxEntries; idx++) {
        if (ptr + 46 > zipBuffer.length) break;
        const sig = zipBuffer.readUInt32LE(ptr);
        if (sig !== 0x02014b50) break;

        const method = zipBuffer.readUInt16LE(ptr + 10);
        const compressedSize = zipBuffer.readUInt32LE(ptr + 20);
        const uncompressedSize = zipBuffer.readUInt32LE(ptr + 24);
        const fileNameLen = zipBuffer.readUInt16LE(ptr + 28);
        const extraLen = zipBuffer.readUInt16LE(ptr + 30);
        const commentLen = zipBuffer.readUInt16LE(ptr + 32);
        const localHeaderOffset = zipBuffer.readUInt32LE(ptr + 42);

        const name = zipBuffer.subarray(ptr + 46, ptr + 46 + fileNameLen).toString('utf8');
        ptr += 46 + fileNameLen + extraLen + commentLen;

        const isDirectory = name.endsWith('/');
        seenNames.add(name);

        if (isDirectory || uncompressedSize === 0 || uncompressedSize > 15 * 1024 * 1024) {
          entries.push({ name, isDirectory, compressedSize, uncompressedSize, data: Buffer.alloc(0) });
          continue;
        }

        if (localHeaderOffset + 30 <= zipBuffer.length && zipBuffer.readUInt32LE(localHeaderOffset) === 0x04034b50) {
          const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
          const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
          const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
          const dataEnd = dataStart + compressedSize;

          if (dataStart <= zipBuffer.length && dataEnd <= zipBuffer.length) {
            const rawSlice = zipBuffer.subarray(dataStart, dataEnd);
            let fileData: Buffer = Buffer.alloc(0);
            try {
              if (method === 0) {
                fileData = rawSlice;
              } else if (method === 8) {
                fileData = zlib.inflateRawSync(rawSlice);
              }
            } catch {
              // Ignore decompression error on encrypted/unsupported entry
            }
            entries.push({ name, isDirectory: false, compressedSize, uncompressedSize, data: fileData });
          }
        }
      }
    }

    // 2. Fallback: Scan Local File Headers (0x04034b50) if EOCD yielded nothing
    if (entries.length === 0) {
      let offset = 0;
      while (offset + 30 <= zipBuffer.length && entries.length < maxEntries) {
        if (zipBuffer.readUInt32LE(offset) !== 0x04034b50) {
          offset++;
          continue;
        }
        const method = zipBuffer.readUInt16LE(offset + 8);
        const compressedSize = zipBuffer.readUInt32LE(offset + 18);
        const uncompressedSize = zipBuffer.readUInt32LE(offset + 22);
        const nameLen = zipBuffer.readUInt16LE(offset + 26);
        const extraLen = zipBuffer.readUInt16LE(offset + 28);
        const name = zipBuffer.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
        const dataStart = offset + 30 + nameLen + extraLen;
        const dataEnd = dataStart + compressedSize;

        if (compressedSize > 0 && dataEnd <= zipBuffer.length && uncompressedSize <= 15 * 1024 * 1024) {
          const rawSlice = zipBuffer.subarray(dataStart, dataEnd);
          let fileData: Buffer = Buffer.alloc(0);
          try {
            if (method === 0) fileData = rawSlice;
            else if (method === 8) fileData = zlib.inflateRawSync(rawSlice);
          } catch {}
          if (!seenNames.has(name)) {
            entries.push({
              name,
              isDirectory: name.endsWith('/'),
              compressedSize,
              uncompressedSize,
              data: fileData,
            });
            seenNames.add(name);
          }
          offset = dataEnd;
        } else {
          offset = dataStart;
        }
      }
    }
  } catch (err) {
    safeLogger.warn('[Files] ZIP entry parse notice:', err);
  }

  return entries;
}

/**
 * Extracts readable text from DOCX, XLSX, PPTX, ODT, or general ZIP archives
 */
export async function extractZipOrOfficeContent(
  buffer: Buffer,
  ext: string,
  originalName: string
): Promise<{ text: string; pageCount: number }> {
  const entries = parseZipEntries(buffer, 150);
  if (entries.length === 0) {
    return { text: `[Archive File: "${originalName}" - No readable entries found]`, pageCount: 1 };
  }

  // 1. Word Document (.docx)
  if (ext === '.docx' || entries.some((e) => e.name === 'word/document.xml')) {
    const docEntry = entries.find((e) => e.name === 'word/document.xml');
    if (docEntry && docEntry.data.length > 0) {
      const xml = docEntry.data.toString('utf8');
      const text = decodeXmlEntities(
        xml
          .replace(/<w:p\b[^>]*>/gi, '\n')
          .replace(/<w:br\b[^>]*\/?>/gi, '\n')
          .replace(/<w:tab\b[^>]*\/?>/gi, '\t')
          .replace(/<[^>]+>/g, '')
      )
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      const pages = Math.max(1, Math.ceil(text.length / 2200));
      return { text, pageCount: pages };
    }
  }

  // 2. Excel Spreadsheet (.xlsx)
  if (ext === '.xlsx' || entries.some((e) => e.name.startsWith('xl/worksheets/sheet'))) {
    const sharedStrings: string[] = [];
    const sharedEntry = entries.find((e) => e.name === 'xl/sharedStrings.xml');
    if (sharedEntry && sharedEntry.data.length > 0) {
      const xml = sharedEntry.data.toString('utf8');
      const siMatches = xml.match(/<si\b[^>]*>[\s\S]*?<\/si>/gi) || [];
      for (const si of siMatches) {
        const cellText = decodeXmlEntities(si.replace(/<[^>]+>/g, ''));
        sharedStrings.push(cellText);
      }
    }

    const sheetEntries = entries
      .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name) && e.data.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const sheetOutputs: string[] = [];
    for (const sheet of sheetEntries) {
      const xml = sheet.data.toString('utf8');
      const rows = xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/gi) || [];
      const rowLines: string[] = [];
      for (const rowXml of rows) {
        const cells = rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>/gi) || [];
        const cellVals: string[] = [];
        for (const cellXml of cells) {
          const typeMatch = cellXml.match(/\bt="([^"]+)"/i);
          const cellType = typeMatch ? typeMatch[1] : '';
          const valMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/i);
          const inlineMatch = cellXml.match(/<is>([\s\S]*?)<\/is>/i);
          if (inlineMatch) {
            cellVals.push(decodeXmlEntities(inlineMatch[1].replace(/<[^>]+>/g, '')).trim());
          } else if (valMatch) {
            const rawVal = valMatch[1].trim();
            if (cellType === 's') {
              const sIdx = parseInt(rawVal, 10);
              cellVals.push(sharedStrings[sIdx] ?? rawVal);
            } else {
              cellVals.push(decodeXmlEntities(rawVal));
            }
          }
        }
        if (cellVals.some((v) => v.length > 0)) {
          rowLines.push(cellVals.join(' | '));
        }
      }
      if (rowLines.length > 0) {
        const sheetName = path.basename(sheet.name, '.xml');
        sheetOutputs.push(`=== Spreadsheet ${sheetName} ===\n${rowLines.join('\n')}`);
      }
    }

    if (sheetOutputs.length > 0) {
      const text = sheetOutputs.join('\n\n').slice(0, 200000);
      return { text, pageCount: Math.max(1, sheetOutputs.length) };
    }
  }

  // 3. PowerPoint Presentation (.pptx)
  if (ext === '.pptx' || entries.some((e) => e.name.startsWith('ppt/slides/slide'))) {
    const slideEntries = entries
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.name) && e.data.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const slidesText: string[] = [];
    for (let i = 0; i < slideEntries.length; i++) {
      const xml = slideEntries[i].data.toString('utf8');
      const slideText = decodeXmlEntities(
        xml
          .replace(/<\/a:p>/gi, '\n')
          .replace(/<[^>]+>/g, '')
      )
        .replace(/\n{2,}/g, '\n')
        .trim();
      if (slideText) {
        slidesText.push(`=== Slide ${i + 1} ===\n${slideText}`);
      }
    }
    if (slidesText.length > 0) {
      return { text: slidesText.join('\n\n').slice(0, 200000), pageCount: slidesText.length };
    }
  }

  // 4. OpenDocument (.odt / .ods / .odp)
  if (['.odt', '.ods', '.odp'].includes(ext) || entries.some((e) => e.name === 'content.xml')) {
    const contentEntry = entries.find((e) => e.name === 'content.xml');
    if (contentEntry && contentEntry.data.length > 0) {
      const xml = contentEntry.data.toString('utf8');
      const text = decodeXmlEntities(
        xml
          .replace(/<\/text:p>/gi, '\n')
          .replace(/<\/table:table-row>/gi, '\n')
          .replace(/<\/table:table-cell>/gi, ' | ')
          .replace(/<[^>]+>/g, '')
      )
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (text) {
        return { text: text.slice(0, 200000), pageCount: Math.max(1, Math.ceil(text.length / 2200)) };
      }
    }
  }

  // 5. General ZIP Archive: Extract directory tree + contents of all readable files inside the ZIP
  const fileListSummary = entries
    .filter((e) => !e.name.startsWith('__MACOSX/') && !e.name.endsWith('.DS_Store'))
    .map((e) => (e.isDirectory ? `📁 ${e.name}` : `📄 ${e.name} (${e.uncompressedSize} bytes)`))
    .join('\n');

  const extractedFilesOutput: string[] = [
    `[ZIP ARCHIVE OVERVIEW: "${originalName}" — Total ${entries.length} entries]\nArchive File Tree:\n${fileListSummary}\n`,
  ];

  let totalExtractedChars = extractedFilesOutput[0].length;
  const maxTotalChars = 220000;

  for (const entry of entries) {
    if (totalExtractedChars >= maxTotalChars) break;
    if (entry.isDirectory || entry.data.length === 0) continue;
    if (
      entry.name.startsWith('__MACOSX/') ||
      entry.name.includes('/.git/') ||
      entry.name.includes('/node_modules/') ||
      entry.name.endsWith('.DS_Store')
    ) {
      continue;
    }

    const entryExt = path.extname(entry.name).toLowerCase();

    // Skip binary images/audio/video/executables inside ZIP
    if (
      ALLOWED_IMAGE_EXTS.has(entryExt) ||
      ALLOWED_AUDIO_EXTS.has(entryExt) ||
      ALLOWED_VIDEO_EXTS.has(entryExt) ||
      BLOCKED_EXTENSIONS.has(entryExt) ||
      ['.woff', '.woff2', '.ttf', '.eot', '.ico', '.pyc', '.class', '.o', '.obj'].includes(entryExt)
    ) {
      continue;
    }

    // Check if entry inside ZIP is a PDF
    if (entryExt === '.pdf') {
      try {
        const pdfInside = await extractTextFromPDFBuffer(entry.data);
        if (pdfInside.text && pdfInside.text.trim()) {
          const snippet = pdfInside.text.trim().slice(0, 40000);
          const block = `\n=== FILE IN ZIP: ${entry.name} (PDF, ${pdfInside.pageCount} pages) ===\n${snippet}\n`;
          extractedFilesOutput.push(block);
          totalExtractedChars += block.length;
        }
      } catch {}
      continue;
    }

    // Check if entry inside ZIP is an Office document (.docx, .xlsx, .pptx)
    if (['.docx', '.xlsx', '.pptx', '.odt'].includes(entryExt)) {
      try {
        const officeInside = await extractZipOrOfficeContent(entry.data, entryExt, entry.name);
        if (officeInside.text && officeInside.text.trim()) {
          const snippet = officeInside.text.trim().slice(0, 40000);
          const block = `\n=== FILE IN ZIP: ${entry.name} ===\n${snippet}\n`;
          extractedFilesOutput.push(block);
          totalExtractedChars += block.length;
        }
      } catch {}
      continue;
    }

    // Check if entry data is readable text/code
    const sample = entry.data.subarray(0, Math.min(512, entry.data.length));
    let nullBytes = 0;
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) nullBytes++;
    }

    if (nullBytes <= 4) {
      const contentStr = entry.data.toString('utf8').replace(/\0/g, '').trim();
      if (contentStr.length > 0) {
        const maxPerFile = Math.min(35000, maxTotalChars - totalExtractedChars);
        const snippet = contentStr.slice(0, maxPerFile);
        const block = `\n=== FILE IN ZIP: ${entry.name} ===\n${snippet}${contentStr.length > maxPerFile ? '\n...[truncated]' : ''}\n`;
        extractedFilesOutput.push(block);
        totalExtractedChars += block.length;
      }
    }
  }

  const combinedText = extractedFilesOutput.join('\n').trim();
  const estPages = Math.max(1, Math.ceil(combinedText.length / 2200));
  return { text: combinedText, pageCount: estPages };
}

/**
 * Extracts readable text from any general file buffer (UTF-8, UTF-16LE, GZIP, RTF, or legacy binary strings)
 */
export function extractGenericFileText(buffer: Buffer, ext: string, originalName: string): string {
  try {
    let workingBuf = buffer;

    // Decompress single-file GZIP (.gz) if applicable
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      try {
        workingBuf = zlib.gunzipSync(buffer);
      } catch {}
    }

    // Check UTF-16LE BOM (FF FE) or UTF-16BE BOM (FE FF)
    if (workingBuf.length >= 2 && workingBuf[0] === 0xff && workingBuf[1] === 0xfe) {
      return workingBuf.subarray(2).toString('utf16le').replace(/\0/g, '').slice(0, 200000).trim();
    }

    // Check if standard UTF-8 text
    const sample = workingBuf.subarray(0, Math.min(512, workingBuf.length));
    let nullCount = 0;
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) nullCount++;
    }

    if (nullCount <= 4) {
      let text = workingBuf.toString('utf8').replace(/\0/g, '');
      // Basic RTF cleanup if .rtf
      if (ext === '.rtf' || text.startsWith('{\\rtf')) {
        text = text
          .replace(/\\par\b/g, '\n')
          .replace(/\\tab\b/g, '\t')
          .replace(/\\'[0-9a-fA-F]{2}/g, '')
          .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
          .replace(/[{}]/g, '');
      }
      return text.slice(0, 200000).trim();
    }

    // Fallback for binary/legacy files (.doc, .xls, custom binary): extract contiguous printable strings
    const printableMatches = workingBuf.toString('latin1').match(/[A-Za-z0-9\s.,;:'"?!()\-_/\\@#$%^&*+=[\]{}|<>~`]{6,}/g);
    if (printableMatches && printableMatches.length > 0) {
      return `[Extracted strings from "${originalName}"]:\n` + printableMatches.join('\n').slice(0, 120000).trim();
    }

    return `[Attached File: "${originalName}" (${workingBuf.length} bytes)]`;
  } catch {
    return `[Attached File: "${originalName}"]`;
  }
}

/**
 * Sanitizes original filename for metadata display and download disposition.
 */
export function sanitizeOriginalFilename(rawName?: string): string {
  if (!rawName) return 'file.dat';
  const base = path.basename(rawName.trim())
    .replace(/[\r\n\0\t\x00-\x1f"'\\]/g, '')
    .replace(/[<>]/g, '')
    .trim();
  return base.slice(0, 150) || 'file.dat';
}

/**
 * Pre-flight stream inspector for multipart uploads.
 */
export function detectUploadPathTraversal(req: any, res: any, next: any) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }

  const onData = (chunk: Buffer) => {
    const headerSnippet = chunk.toString('utf8', 0, Math.min(chunk.length, 4096));
    const match = headerSnippet.match(/filename="([^"]+)"/i);
    if (match) {
      const rawFilename = match[1];
      if (
        rawFilename.includes('..') ||
        rawFilename.includes('/') ||
        rawFilename.includes('\\') ||
        rawFilename.includes('\0') ||
        rawFilename.includes('%2e%2e') ||
        rawFilename.includes('%2f') ||
        rawFilename.includes('%5c')
      ) {
        req.resume();
        return res.status(400).json({
          error: 'Security violation: Path traversal sequence detected in filename parameter.',
          status: 400,
        });
      }
    }
    req.unshift(chunk);
    next();
  };

  req.once('data', onData);
}

// Multer disk storage config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const rawExt = path.extname(file.originalname).toLowerCase();
    const safeExt = rawExt.replace(/[^a-z0-9.]/g, '').slice(0, 10) || '.dat';
    const randomHex = crypto.randomBytes(12).toString('hex');
    const timestamp = Date.now();
    cb(null, `${timestamp}_${randomHex}${safeExt}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_TOTAL_UPLOAD_SIZE, // 50MB maximum ceiling
    files: 5,
  },
  fileFilter: (_req, file, cb) => {
    try {
      if (
        file.originalname.includes('..') ||
        file.originalname.includes('/') ||
        file.originalname.includes('\\') ||
        file.originalname.includes('\0')
      ) {
        return cb(new Error('Path traversal sequence detected in filename.'));
      }

      const ext = path.extname(file.originalname).toLowerCase();
      const mime = (file.mimetype || '').toLowerCase();

      const validation = validateExtensionAndMime(ext, mime);
      if (!validation.isValid) {
        return cb(new Error(validation.error || 'Invalid file format.'));
      }

      cb(null, true);
    } catch {
      cb(new Error('Upload validation failed. Please check your file and try again.'));
    }
  },
});

export async function processUploadedFile(
  file: Express.Multer.File,
  userId: string,
  conversationId?: string
): Promise<FileRecord> {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  const sizeBytes = file.size || 0;

  // Step 1: Server-Side Extension & MIME Validation
  const extMimeCheck = validateExtensionAndMime(ext, mime);
  if (!extMimeCheck.isValid) {
    try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch {}
    throw new Error(extMimeCheck.error || 'Invalid file extension or MIME type.');
  }

  if (sizeBytes > MAX_TOTAL_UPLOAD_SIZE) {
    try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch {}
    throw new Error(`File size exceeds the 50MB maximum upload limit.`);
  }

  // Validate binary signatures / magic bytes
  const magicValidation = validateFileMagicBytes(file.path, ext, mime);
  if (!magicValidation.isValid) {
    try {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch {}
    throw new Error(magicValidation.error || 'File validation failed.');
  }

  let fileType: FileRecord['type'] = 'other';
  let extractedText: string | undefined;
  let chunks: FileRecord['chunks'] | undefined;
  let isScanned = false;
  let pageCount = 1;
  let duration: number | undefined;

  const sanitizedOriginalName = sanitizeOriginalFilename(file.originalname);

  // Inspect magic bytes for PK\x03\x04 (ZIP / DOCX / XLSX / PPTX / ODT / EPUB / JAR)
  const rawBuffer = fs.readFileSync(file.path);
  const isZipSignature =
    rawBuffer.length >= 4 &&
    rawBuffer[0] === 0x50 &&
    rawBuffer[1] === 0x4b &&
    (rawBuffer[2] === 0x03 || rawBuffer[2] === 0x05 || rawBuffer[2] === 0x07);

  if (ext === '.pdf' || mime === 'application/pdf') {
    fileType = 'pdf';
    try {
      const pdfResult = await processPDFFile(file.path);
      extractedText = pdfResult.extractedText;
      chunks = pdfResult.chunks;
      isScanned = Boolean(pdfResult.isScanned);
      pageCount = pdfResult.pageCount || 1;
    } catch (pdfErr) {
      console.warn('PDF processing error:', pdfErr);
      extractedText = 'PDF uploaded.';
    }
  } else if (ALLOWED_IMAGE_EXTS.has(ext) || mime.startsWith('image/')) {
    fileType = 'image';
  } else if (ALLOWED_AUDIO_EXTS.has(ext) || mime.startsWith('audio/')) {
    fileType = 'audio';
  } else if (ALLOWED_VIDEO_EXTS.has(ext) || mime.startsWith('video/')) {
    fileType = 'video';
  } else if (
    isZipSignature ||
    ext === '.zip' ||
    ['.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp', '.epub', '.jar'].includes(ext) ||
    mime.includes('zip') ||
    mime.includes('officedocument')
  ) {
    fileType = 'other';
    try {
      const zipResult = await extractZipOrOfficeContent(rawBuffer, ext, sanitizedOriginalName);
      extractedText = zipResult.text;
      pageCount = zipResult.pageCount || 1;
      if (extractedText && extractedText.length > 0) {
        chunks = createTextChunks(extractedText, pageCount);
      }
    } catch (zipErr) {
      console.warn('ZIP/Office extraction error:', zipErr);
      extractedText = extractGenericFileText(rawBuffer, ext, sanitizedOriginalName);
      if (extractedText) {
        chunks = createTextChunks(extractedText, 1);
      }
    }
  } else {
    fileType = 'other';
    try {
      extractedText = extractGenericFileText(rawBuffer, ext, sanitizedOriginalName);
      if (extractedText && extractedText.length > 0) {
        pageCount = Math.max(1, Math.ceil(extractedText.length / 2200));
        chunks = createTextChunks(extractedText, pageCount);
      }
    } catch (readErr) {
      console.warn('Generic file read error:', readErr);
    }
  }

  const { storagePath } = generateStoragePath(userId, file.originalname);

  // Step 2: Storage Upload
  const uploadResult = await uploadToSupabaseStorage({
    userId,
    uniqueFileId: file.filename,
    storagePath,
    filePath: file.path,
    mimeType: file.mimetype,
    originalName: sanitizedOriginalName,
  });

  if (!uploadResult.success) {
    safeLogger.error('[Files] Storage upload failed for file:', uploadResult.error);
    try {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (cleanupErr) {
      safeLogger.warn('[Files] Local temp file cleanup notice:', cleanupErr);
    }
    const storageErr: any = new Error(
      uploadResult.error || 'Failed to upload file to cloud storage.'
    );
    storageErr.statusCode = 503;
    storageErr.code = 'STORAGE_UNAVAILABLE';
    throw storageErr;
  }

  // Step 3: Database Metadata Save
  try {
    const record = await db.createFileRecord({
      userId,
      conversationId,
      storageProvider: uploadResult.storageProvider || 'supabase',
      bucketName: uploadResult.bucketName || 'aestific-files',
      storagePath,
      uniqueFileId: file.filename,
      filename: file.filename,
      originalName: sanitizedOriginalName,
      type: fileType,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      url: `/api/files/download/${file.filename}`,
      extractedText,
      chunks,
      isScanned,
      pageCount,
      duration,
    });

    await db.incrementDailyUsage(userId, { fileCount: 1 });

    // Ephemeral filesystem hardening: Clean up temporary processing/staging file ONLY if persisted to external cloud
    if ((process.env.NODE_ENV === 'production' && uploadResult.storageProvider !== 'local-fallback') || file.path?.includes('temp_') || file.path?.includes('mock_')) {
      try {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (cleanupNotice) {
        safeLogger.warn('[Files] Post-upload temporary processing file cleanup notice:', cleanupNotice);
      }
    }

    return record;
  } catch (dbErr: any) {
    safeLogger.error('[Files] Database save failed after successful storage upload. Performing compensating cleanup:', dbErr?.message || dbErr);
    try {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch {}
    try {
      await deleteFromSupabaseStorage(storagePath, file.filename, uploadResult.bucketName);
      safeLogger.info('[Files] Compensating storage cleanup completed for:', storagePath);
    } catch (cleanupErr: any) {
      safeLogger.warn('[Files] Compensating cleanup error notice:', cleanupErr?.message || cleanupErr);
    }
    const dbException: any = new Error('Database error occurred while saving file metadata.');
    dbException.code = dbErr?.code || 'DATABASE_ERROR';
    dbException.statusCode = 500;
    dbException.cause = dbErr;
    throw dbException;
  }
}

export const uploadMiddleware = upload;

export const audioUpload = multer({
  storage,
  limits: {
    fileSize: MAX_AUDIO_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    try {
      if (
        file.originalname.includes('..') ||
        file.originalname.includes('/') ||
        file.originalname.includes('\\') ||
        file.originalname.includes('\0')
      ) {
        return cb(new Error('Invalid characters in audio filename.'));
      }
      const ext = path.extname(file.originalname).toLowerCase();
      const mime = (file.mimetype || '').toLowerCase();
      if (!ALLOWED_AUDIO_EXTS.has(ext)) {
        return cb(new Error(`Unsupported audio format '${ext}'. Allowed: WebM, MP3, WAV, OGG, M4A, FLAC, AAC.`));
      }
      if (!ALLOWED_AUDIO_MIMES.has(mime) && !mime.startsWith('audio/') && mime !== 'application/octet-stream') {
        return cb(new Error(`Invalid MIME type '${mime}' for audio recording.`));
      }
      cb(null, true);
    } catch {
      cb(new Error('Audio validation failed. Please check your file and try again.'));
    }
  },
});

export const audioUploadMiddleware = audioUpload;
