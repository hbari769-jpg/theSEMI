import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { safeLogger, redactSensitiveData } from './error-handler.js';

export const UPLOADS_DIR = path.resolve('uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

let supabaseClientInstance: SupabaseClient | null = null;
const verifiedBuckets = new Set<string>();

/**
 * Strips leading/trailing slashes, resolves backslashes, collapses multi-slashes,
 * and ensures path is safe and valid for cloud object storage URLs.
 */
export function sanitizeStoragePath(rawPath?: string | null): string {
  if (!rawPath) return '';
  return rawPath
    .toString()
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/+/g, '/');
}

export function getSupabaseConfig() {
  let url = (process.env.SUPABASE_URL || '').trim();
  // Strip trailing paths like /rest/v1 or /storage/v1 and trailing slashes
  url = url.replace(/\/+(?:rest|storage|auth)\/v\d+.*$/i, '').replace(/\/+$/, '');

  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
  let bucketName = (process.env.SUPABASE_BUCKET_NAME || 'aestific-files').trim().replace(/^\/+|\/+$/g, '');
  if (!bucketName) {
    bucketName = 'aestific-files';
  }

  const isConfigured = Boolean(
    url &&
    serviceRoleKey &&
    url.startsWith('https://') &&
    !serviceRoleKey.startsWith('MY_') &&
    serviceRoleKey.length > 20
  );

  return {
    url,
    serviceRoleKey,
    bucketName,
    isConfigured,
  };
}

export function getSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config.isConfigured) {
    return null;
  }

  if (supabaseClientInstance) {
    return supabaseClientInstance;
  }

  try {
    supabaseClientInstance = createClient(config.url, config.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    safeLogger.info(`[Supabase Storage] Initialized Storage Client for bucket: ${config.bucketName}`);
    return supabaseClientInstance;
  } catch (err: any) {
    safeLogger.warn('[Supabase Storage] Failed to initialize client:', err?.message || err);
    return null;
  }
}

/**
 * Ensures bucket exists in Supabase Storage project.
 *
 * CRITICAL SECURITY GOVERNANCE:
 * 1. Production must NEVER automatically create a public Supabase bucket.
 * 2. The authoritative production bucket must remain strictly PRIVATE.
 * 3. In production (NODE_ENV === 'production'), automatic bucket creation is completely disabled.
 *    If the bucket does not exist, fail safely with a clear internal configuration error
 *    without exposing Supabase credentials to users.
 * 4. In development/testing (NODE_ENV !== 'production'), if automatic bucket creation is needed,
 *    it MUST create the bucket as PRIVATE ({ public: false }), never public.
 * 5. If an existing bucket is detected with public: true, access is strictly rejected to prevent
 *    exposing private user files.
 */
export async function ensureBucketExists(
  client: SupabaseClient,
  bucketName: string,
  options?: { isProduction?: boolean }
): Promise<boolean> {
  const cleanBucket = (bucketName || '').trim().replace(/^\/+|\/+$/g, '');
  if (!cleanBucket) return false;
  if (verifiedBuckets.has(cleanBucket)) return true;

  const isProduction = options?.isProduction !== undefined
    ? options.isProduction
    : process.env.NODE_ENV === 'production';

  try {
    const { data: bucket, error: getErr } = await client.storage.getBucket(cleanBucket);
    if (bucket && !getErr) {
      // Security Check: If the bucket is configured as public, reject it.
      // Aestific's architecture strictly mandates private buckets with authenticated access.
      if (bucket.public) {
        safeLogger.error(
          `[Supabase Storage] Security Violation: Storage bucket '${cleanBucket}' is configured as public. Aestific requires private buckets with authenticated access.`
        );
        return false;
      }
      verifiedBuckets.add(cleanBucket);
      return true;
    }

    // Bucket does not exist or could not be retrieved
    if (isProduction) {
      // In production: NEVER automatically create a bucket.
      // Must fail safely with a sanitized internal configuration error.
      safeLogger.error(
        `[Supabase Storage] Authoritative production bucket '${cleanBucket}' does not exist or is inaccessible. Automatic bucket creation is disabled in production to maintain strict storage governance.`
      );
      return false;
    }

    // In development / testing:
    // Create the bucket strictly as PRIVATE ({ public: false }), never public.
    safeLogger.info(`[Supabase Storage] Initializing private storage bucket '${cleanBucket}' for development/testing.`);
    const { error: createErr } = await client.storage.createBucket(cleanBucket, {
      public: false, // Strictly PRIVATE - never public
    });

    if (!createErr || createErr.message?.toLowerCase().includes('already exists')) {
      verifiedBuckets.add(cleanBucket);
      return true;
    }

    safeLogger.warn(`[Supabase Storage] Notice on bucket '${cleanBucket}':`, createErr.message);
    return false;
  } catch (err: any) {
    safeLogger.warn(`[Supabase Storage] Bucket verification notice:`, err?.message || err);
    return false;
  }
}

/**
 * Resets the verified buckets in-memory cache (primarily used in automated test suites).
 */
export function resetVerifiedBucketsCache(): void {
  verifiedBuckets.clear();
}

/**
 * Generates unique file ID and standard storage path:
 * Format: users/{user_id}/{unique_file_id}
 */
export function generateStoragePath(userId: string, originalName: string): { uniqueFileId: string; storagePath: string } {
  const safeExt = (path.extname(originalName || '') || '.dat').toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 8);
  const randomHex = crypto.randomBytes(8).toString('hex');
  const timestamp = Date.now();
  const safeUserId = (userId || 'user').toString().trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'user';
  const cleanExt = safeExt.startsWith('.') ? safeExt : `.${safeExt}`;
  const uniqueFileId = `${timestamp}_${randomHex}${cleanExt}`;
  const storagePath = `users/${safeUserId}/${uniqueFileId}`;

  return { uniqueFileId, storagePath };
}

export type StorageUploadMock = (options: {
  userId: string;
  uniqueFileId?: string;
  storagePath?: string;
  buffer?: Buffer;
  filePath?: string;
  mimeType: string;
  originalName: string;
}) => Promise<{
  success: boolean;
  storageProvider: 'supabase' | 'local-fallback';
  bucketName: string;
  storagePath: string;
  uniqueFileId: string;
  sizeBytes: number;
  url: string;
  error?: string;
}>;

let storageUploadMock: StorageUploadMock | null = null;

export function setStorageUploadMock(mock: StorageUploadMock | null) {
  storageUploadMock = mock;
}

export type StorageDeleteMock = (
  storagePath: string,
  uniqueFileId?: string,
  bucketName?: string
) => Promise<boolean>;

let storageDeleteMock: StorageDeleteMock | null = null;

export function setStorageDeleteMock(mock: StorageDeleteMock | null) {
  storageDeleteMock = mock;
}

export type StorageDownloadMock = (
  storagePath: string,
  uniqueFileId?: string,
  bucketName?: string
) => Promise<{ buffer: Buffer | null; mimeType?: string; sizeBytes?: number; fromSupabase: boolean } | Buffer | null>;

let storageDownloadMock: StorageDownloadMock | null = null;

export function setStorageDownloadMock(mock: StorageDownloadMock | null) {
  storageDownloadMock = mock;
}

/**
 * Uploads a file buffer or disk path to Supabase Storage
 */
export async function uploadToSupabaseStorage(options: {
  userId: string;
  uniqueFileId?: string;
  storagePath?: string;
  buffer?: Buffer;
  filePath?: string;
  mimeType: string;
  originalName: string;
}): Promise<{
  success: boolean;
  storageProvider: 'supabase' | 'local-fallback';
  bucketName: string;
  storagePath: string;
  uniqueFileId: string;
  sizeBytes: number;
  url: string;
  error?: string;
}> {
  if (storageUploadMock) {
    return storageUploadMock(options);
  }

  const { userId, mimeType, originalName } = options;
  const config = getSupabaseConfig();
  const bucketName = config.bucketName;

  let storagePath = options.storagePath;
  let uniqueFileId = options.uniqueFileId;

  if (!storagePath || !uniqueFileId) {
    const generated = generateStoragePath(userId, originalName);
    storagePath = generated.storagePath;
    uniqueFileId = generated.uniqueFileId;
  }

  // Ensure storagePath is strictly formatted and sanitized
  storagePath = sanitizeStoragePath(storagePath);

  let fileBuffer: Buffer;
  if (options.buffer) {
    fileBuffer = options.buffer;
  } else if (options.filePath && fs.existsSync(options.filePath)) {
    try {
      fileBuffer = fs.readFileSync(options.filePath);
    } catch (readErr: any) {
      safeLogger.error('[Supabase Storage] Failed to read file from disk path:', readErr?.message || readErr);
      return {
        success: false,
        storageProvider: 'supabase',
        bucketName,
        storagePath: storagePath || '',
        uniqueFileId: uniqueFileId || '',
        sizeBytes: 0,
        url: '',
        error: 'Failed to read file for storage upload.',
      };
    }
  } else {
    safeLogger.error('[Supabase Storage] No file buffer or valid file path provided for upload.');
    return {
      success: false,
      storageProvider: 'supabase',
      bucketName,
      storagePath: storagePath || '',
      uniqueFileId: uniqueFileId || '',
      sizeBytes: 0,
      url: '',
      error: 'No file buffer or file path provided for upload.',
    };
  }

  const isProd = process.env.NODE_ENV === 'production';
  const isLocalDev = !isProd && !config.isConfigured;

  // Local development fallback only when explicitly unconfigured outside production
  if (isLocalDev) {
    safeLogger.info('[Supabase Storage] Running in local-development mode (file-backed disk cache).');
    const localDiskPath = path.join(UPLOADS_DIR, uniqueFileId);
    try {
      fs.writeFileSync(localDiskPath, fileBuffer);
      return {
        success: true,
        storageProvider: 'supabase',
        bucketName: 'local-dev',
        storagePath,
        uniqueFileId,
        sizeBytes: fileBuffer.length,
        url: `/api/files/download/${uniqueFileId}`,
      };
    } catch (diskErr: any) {
      safeLogger.error('[Supabase Storage] Failed to write local disk cache:', diskErr?.message || diskErr);
      return {
        success: false,
        storageProvider: 'supabase',
        bucketName: 'local-dev',
        storagePath,
        uniqueFileId,
        sizeBytes: 0,
        url: '',
        error: 'Failed to save local file.',
      };
    }
  }

  // Authoritative Supabase Storage or Local Disk Fallback
  if (!config.isConfigured) {
    safeLogger.info('[Supabase Storage] Supabase storage is not configured. Falling back to local disk storage.');
    const localDiskPath = path.join(UPLOADS_DIR, uniqueFileId);
    try {
      fs.writeFileSync(localDiskPath, fileBuffer);
      return {
        success: true,
        storageProvider: 'local-fallback',
        bucketName: 'local-storage',
        storagePath: storagePath || uniqueFileId,
        uniqueFileId,
        sizeBytes: fileBuffer.length,
        url: `/api/files/download/${uniqueFileId}`,
      };
    } catch (diskErr: any) {
      safeLogger.error('[Supabase Storage] Failed to write local fallback disk:', diskErr?.message || diskErr);
      return {
        success: false,
        storageProvider: 'local-fallback',
        bucketName: 'local-storage',
        storagePath: storagePath || '',
        uniqueFileId: uniqueFileId || '',
        sizeBytes: 0,
        url: '',
        error: 'Failed to save local file.',
      };
    }
  }

  const client = getSupabaseClient();
  if (!client) {
    safeLogger.error('[Supabase Storage] Upload rejected: Supabase client could not be initialized.');
    return {
      success: false,
      storageProvider: 'supabase',
      bucketName,
      storagePath,
      uniqueFileId,
      sizeBytes: fileBuffer.length,
      url: '',
      error: 'Storage service is unavailable.',
    };
  }

  try {
    const bucketReady = await ensureBucketExists(client, bucketName);
    if (!bucketReady) {
      safeLogger.error(`[Supabase Storage] Target bucket '${bucketName}' could not be verified or is inaccessible.`);
      return {
        success: false,
        storageProvider: 'supabase',
        bucketName,
        storagePath,
        uniqueFileId,
        sizeBytes: fileBuffer.length,
        url: '',
        error: 'Storage service bucket is unavailable.',
      };
    }

    const { error: uploadError } = await client.storage
      .from(bucketName)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      safeLogger.error('[Supabase Storage] Supabase upload failed with error:', uploadError.message);
      return {
        success: false,
        storageProvider: 'supabase',
        bucketName,
        storagePath,
        uniqueFileId,
        sizeBytes: fileBuffer.length,
        url: '',
        error: 'Storage service upload failed.',
      };
    }

    // Remote persistence confirmed: write local disk cache in dev/test for fast verification
    if (!isProd) {
      const localDiskPath = path.join(UPLOADS_DIR, uniqueFileId);
      try {
        fs.writeFileSync(localDiskPath, fileBuffer);
      } catch (diskErr) {
        safeLogger.warn('[Supabase Storage] Local cache disk write warning:', diskErr);
      }
    }

    return {
      success: true,
      storageProvider: 'supabase',
      bucketName,
      storagePath,
      uniqueFileId,
      sizeBytes: fileBuffer.length,
      url: `/api/files/download/${uniqueFileId}`,
    };
  } catch (err: any) {
    safeLogger.error('[Supabase Storage] Upload exception:', err?.message || err);
    return {
      success: false,
      storageProvider: 'supabase',
      bucketName,
      storagePath,
      uniqueFileId,
      sizeBytes: fileBuffer.length,
      url: '',
      error: 'Storage service is temporarily unavailable.',
    };
  }
}

/**
 * Downloads a file from Supabase Storage (or local cache)
 */
export async function getFromSupabaseStorage(
  storagePath: string,
  uniqueFileId?: string,
  bucketName?: string
): Promise<{
  buffer: Buffer | null;
  mimeType?: string;
  sizeBytes?: number;
  fromSupabase: boolean;
}> {
  const isProd = process.env.NODE_ENV === 'production';
  const cleanPath = sanitizeStoragePath(storagePath);
  const filename = uniqueFileId || path.basename(cleanPath);
  const localDiskPath = path.join(UPLOADS_DIR, filename);

  // 0. Download mock override (for deterministic testing)
  if (storageDownloadMock) {
    const mockRes = await storageDownloadMock(cleanPath, filename, bucketName);
    if (mockRes !== null) {
      if (Buffer.isBuffer(mockRes)) {
        return {
          buffer: mockRes,
          sizeBytes: mockRes.length,
          fromSupabase: true,
        };
      }
      return mockRes;
    }
  }

  // 1. Development/test mode ONLY: try local disk cache first if available
  if (!isProd && fs.existsSync(localDiskPath)) {
    try {
      const buffer = fs.readFileSync(localDiskPath);
      return { buffer, sizeBytes: buffer.length, fromSupabase: false };
    } catch {}
  }

  // 2. Fetch from Supabase Storage (Authoritative persistent source)
  const client = getSupabaseClient();
  const config = getSupabaseConfig();
  const effectiveBucket = (bucketName || config.bucketName || 'aestific-files').trim().replace(/^\/+|\/+$/g, '') || 'aestific-files';

  if (client && config.isConfigured && cleanPath) {
    try {
      const { data, error } = await client.storage
        .from(effectiveBucket)
        .download(cleanPath);

      if (data && !error) {
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Cache to local disk in development/test only
        if (!isProd) {
          try {
            fs.writeFileSync(localDiskPath, buffer);
          } catch {}
        }

        return {
          buffer,
          mimeType: data.type || undefined,
          sizeBytes: buffer.length,
          fromSupabase: true,
        };
      }
    } catch (err: any) {
      safeLogger.warn('[Supabase Storage] Download error:', err?.message || err);
    }
  }

  // In production when Supabase is configured: DO NOT fall back to accidental or ephemeral local files
  if (isProd && config.isConfigured) {
    return { buffer: null, fromSupabase: false };
  }

  // Fallback to local disk when unconfigured (local-fallback) or in development/testing
  if (fs.existsSync(localDiskPath)) {
    try {
      const buffer = fs.readFileSync(localDiskPath);
      return { buffer, sizeBytes: buffer.length, fromSupabase: false };
    } catch {}
  }

  return { buffer: null, fromSupabase: false };
}

/**
 * Deletes an object from Supabase Storage and local disk
 */
export async function deleteFromSupabaseStorage(
  storagePath: string,
  uniqueFileId?: string,
  bucketName?: string
): Promise<boolean> {
  const config = getSupabaseConfig();
  const effectiveBucket = (bucketName || config.bucketName || 'aestific-files').trim().replace(/^\/+|\/+$/g, '') || 'aestific-files';

  if (storageDeleteMock) {
    return storageDeleteMock(storagePath, uniqueFileId, effectiveBucket);
  }

  const cleanPath = sanitizeStoragePath(storagePath);
  let success = true;

  // 1. Delete local disk copy
  try {
    const filename = uniqueFileId || path.basename(cleanPath);
    const localDiskPath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(localDiskPath)) {
      fs.unlinkSync(localDiskPath);
    }
  } catch (err) {
    safeLogger.warn('[Supabase Storage] Local disk unlink notice:', err);
  }

  // 2. Delete from Supabase Storage
  const client = getSupabaseClient();

  if (client && config.isConfigured && cleanPath) {
    try {
      const { error } = await client.storage
        .from(effectiveBucket)
        .remove([cleanPath]);

      if (error) {
        safeLogger.warn('[Supabase Storage] Delete notice:', error.message);
        success = false;
      }
    } catch (err: any) {
      safeLogger.warn('[Supabase Storage] Delete request failure:', err?.message || err);
      success = false;
    }
  }

  return success;
}

export interface BulkStorageDeleteResult {
  deletedCount: number;
  storageObjectsDeleted: number;
  localFilesDeleted: number;
  errors: string[];
  failedPaths: string[];
  successfulPaths: string[];
}

let storageBulkDeleteMock: ((items: Array<{ storagePath: string; uniqueFileId?: string; bucketName?: string }>) => Promise<BulkStorageDeleteResult>) | null = null;

export function setStorageBulkDeleteMock(
  mock: ((items: Array<{ storagePath: string; uniqueFileId?: string; bucketName?: string }>) => Promise<BulkStorageDeleteResult>) | null
) {
  storageBulkDeleteMock = mock;
}

/**
 * Bulk delete multiple objects from Supabase Storage and local disk (used during 30-day retention cleanup)
 */
export async function bulkDeleteFromSupabaseStorage(
  items: Array<{ storagePath: string; uniqueFileId?: string; bucketName?: string }>
): Promise<BulkStorageDeleteResult> {
  if (storageBulkDeleteMock) {
    return storageBulkDeleteMock(items);
  }

  if (!items || items.length === 0) {
    return {
      deletedCount: 0,
      storageObjectsDeleted: 0,
      localFilesDeleted: 0,
      errors: [],
      failedPaths: [],
      successfulPaths: [],
    };
  }

  let localFilesDeleted = 0;
  let storageObjectsDeleted = 0;
  const errors: string[] = [];
  const failedPaths: string[] = [];
  const successfulPaths: string[] = [];

  // 1. Delete local copies
  for (const item of items) {
    try {
      const cleanPath = sanitizeStoragePath(item.storagePath);
      const filename = item.uniqueFileId || path.basename(cleanPath);
      const localDiskPath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(localDiskPath)) {
        fs.unlinkSync(localDiskPath);
        localFilesDeleted++;
      }
    } catch (err: any) {
      safeLogger.warn('[Supabase Storage] Local disk deletion notice:', err?.message || err);
    }
  }

  // 2. Delete from Supabase Storage in chunks of 100
  const client = getSupabaseClient();
  const config = getSupabaseConfig();

  if (config.isConfigured) {
    if (!client) {
      const errMsg = 'Supabase client failed to initialize despite being configured.';
      safeLogger.error('[Supabase Storage] Bulk delete error:', errMsg);
      errors.push(errMsg);
      for (const item of items) {
        if (!item.storagePath) continue;
        const cleanPath = sanitizeStoragePath(item.storagePath)
          .replace(/^(aestific-files|nvelora-files)\//, '')
          .replace(/^\/+/, '');
        if (cleanPath && !failedPaths.includes(cleanPath)) {
          failedPaths.push(cleanPath);
        }
      }
    } else {
      try {
        const pathsByBucket: Record<string, string[]> = {};
        for (const item of items) {
          if (!item.storagePath) continue;
          // Strip any leading bucket name or slashes so key is strictly relative to bucket
          const cleanPath = sanitizeStoragePath(item.storagePath)
            .replace(/^(aestific-files|nvelora-files)\//, '')
            .replace(/^\/+/, '');
          if (!cleanPath) continue;

          const bucket = (item.bucketName || config.bucketName).trim().replace(/^\/+|\/+$/g, '') || 'aestific-files';
          if (!pathsByBucket[bucket]) pathsByBucket[bucket] = [];
          pathsByBucket[bucket].push(cleanPath);
        }

        for (const [bucket, paths] of Object.entries(pathsByBucket)) {
          for (let i = 0; i < paths.length; i += 100) {
            const chunk = paths.slice(i, i + 100);
            try {
              const { data, error } = await client.storage.from(bucket).remove(chunk);
              if (error) {
                const errMsg = `Failed to remove ${chunk.length} objects from bucket ${bucket}: ${error.message}`;
                safeLogger.warn('[Supabase Storage] Bulk delete notice:', errMsg);
                errors.push(errMsg);
                for (const p of chunk) {
                  failedPaths.push(p);
                }
              } else if (data) {
                // Supabase returns an array of successfully removed objects (or empty array if objects were already missing)
                storageObjectsDeleted += Array.isArray(data) ? data.length : chunk.length;
                for (const p of chunk) {
                  successfulPaths.push(p);
                }
              } else {
                storageObjectsDeleted += chunk.length;
                for (const p of chunk) {
                  successfulPaths.push(p);
                }
              }
            } catch (chunkErr: any) {
              const errMsg = `Chunk deletion exception in bucket ${bucket}: ${chunkErr?.message || chunkErr}`;
              safeLogger.warn('[Supabase Storage] Bulk delete exception:', errMsg);
              errors.push(errMsg);
              for (const p of chunk) {
                failedPaths.push(p);
              }
            }
          }
        }
      } catch (err: any) {
        const errMsg = `Supabase bulk delete failure: ${err?.message || err}`;
        safeLogger.warn('[Supabase Storage] Bulk delete notice:', errMsg);
        errors.push(errMsg);
        const succSet = new Set(successfulPaths);
        for (const item of items) {
          if (!item.storagePath) continue;
          const cleanPath = sanitizeStoragePath(item.storagePath)
            .replace(/^(aestific-files|nvelora-files)\//, '')
            .replace(/^\/+/, '');
          if (cleanPath && !succSet.has(cleanPath) && !failedPaths.includes(cleanPath)) {
            failedPaths.push(cleanPath);
          }
        }
      }
    }
  } else {
    // Local dev mode without Supabase: treat paths as successfully deleted with local unlinks
    for (const item of items) {
      if (!item.storagePath) continue;
      const cleanPath = sanitizeStoragePath(item.storagePath)
        .replace(/^(aestific-files|nvelora-files)\//, '')
        .replace(/^\/+/, '');
      if (cleanPath && !successfulPaths.includes(cleanPath)) {
        successfulPaths.push(cleanPath);
      }
    }
  }

  const totalDeleted = Math.max(storageObjectsDeleted, localFilesDeleted);

  return {
    deletedCount: totalDeleted,
    storageObjectsDeleted,
    localFilesDeleted,
    errors,
    failedPaths,
    successfulPaths,
  };
}

export const deleteFromSupabase = deleteFromSupabaseStorage;
export async function downloadFromSupabase(
  storagePath: string,
  uniqueFileId?: string,
  bucketName?: string
): Promise<Buffer | null> {
  const res = await getFromSupabaseStorage(storagePath, uniqueFileId, bucketName);
  return res.buffer;
}

