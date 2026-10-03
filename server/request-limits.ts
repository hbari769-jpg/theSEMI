import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

// ==========================================
// REQUEST BODY SIZE CONSTANTS & SPECIFICATIONS
// ==========================================

/**
 * Standard API request body limit (Small, hardened, and reasonable: 100KB).
 * Applies to standard JSON and URL-encoded APIs (Auth, Admin, Conversations, Settings, etc.).
 */
export const DEFAULT_JSON_LIMIT = '100kb';
export const DEFAULT_JSON_LIMIT_BYTES = 100 * 1024; // 102,400 bytes

export const DEFAULT_URLENCODED_LIMIT = '100kb';
export const DEFAULT_URLENCODED_LIMIT_BYTES = 100 * 1024;

/**
 * Genuinely large JSON endpoints:
 * 1. Chat Streaming Endpoint (/api/chat/stream):
 * Accommodates rich system instructions, multi-turn history, and extracted PDF text chunks.
 */
export const CHAT_STREAM_JSON_LIMIT = '10mb';
export const CHAT_STREAM_JSON_LIMIT_BYTES = 10 * 1024 * 1024; // 10,485,760 bytes

/**
 * 2. Extended text endpoints (/api/admin/send-email, /api/support):
 * Accommodates HTML newsletter templates and detailed support issue descriptions.
 */
export const EXTENDED_TEXT_LIMIT = '1mb';
export const EXTENDED_TEXT_LIMIT_BYTES = 1 * 1024 * 1024; // 1,048,576 bytes

/**
 * 3. File upload ceiling (/api/files/upload):
 * Multipart/form-data ceiling allowing up to 50MB binary file + 5MB multipart boundary overhead.
 */
export const MAX_FILE_UPLOAD_CEILING_BYTES = 55 * 1024 * 1024; // 57,671,680 bytes

/**
 * 4. Voice transcription upload ceiling (/api/voice/transcribe):
 * Multipart/form-data ceiling allowing up to 25MB audio file + 3MB multipart boundary overhead.
 */
export const MAX_VOICE_UPLOAD_CEILING_BYTES = 28 * 1024 * 1024; // 29,360,128 bytes

/**
 * Format bytes into human-readable string (B, KB, MB)
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Pre-flight Content-Length validation middleware.
 * Validates request size before expensive processing, reading streams, or allocating RAM/disk.
 * Immediately terminates with clean HTTP 413 response if size exceeds allowed limit.
 */
export function preflightSizeValidator(maxBytes: number, contextDescription: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const rawLen = req.headers['content-length'];
    if (rawLen !== undefined) {
      const contentLength = parseInt(rawLen, 10);
      if (!isNaN(contentLength) && contentLength > maxBytes) {
        // Discard any incoming bytes on the socket without buffering into memory
        res.setHeader('Connection', 'close');
        req.resume();
        return res.status(413).json({
          error: `Payload Too Large: Request body size (${formatBytes(contentLength)}) exceeds the allowed limit (${formatBytes(maxBytes)}) for ${contextDescription}.`,
          code: 'PAYLOAD_TOO_LARGE',
          status: 413,
          limit: formatBytes(maxBytes),
          received: formatBytes(contentLength),
        });
      }
    }
    next();
  };
}

/**
 * Centralized payload error handler for:
 * 1. Multer LIMIT_FILE_SIZE errors (HTTP 413)
 * 2. Body-parser entity.too.large errors (HTTP 413)
 * 3. Malformed JSON parsing errors (HTTP 400)
 * 4. Other request size or upload violations
 */
import { productionErrorHandler } from './error-handler.js';

export const handlePayloadErrors = productionErrorHandler;
