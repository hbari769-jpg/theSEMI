import { db, RETENTION_DAYS } from './db.js';
import { bulkDeleteFromSupabaseStorage } from './supabase-storage.js';

export { RETENTION_DAYS };

export interface RetentionCleanupSummary {
  startedAt: string;
  completedAt: string;
  retentionDays: number;
  cutoffDate: string;
  messagesFound: number;
  deletedMessagesCount: number;
  deletedConversationsCount: number;
  deletedFilesCount: number;
  deletedStorageObjectsCount: number;
  preservedFilesCount: number;
  success: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

let isProcessCleanupRunning = false;

function normalizeStoragePath(rawPath: string): string {
  if (!rawPath) return '';
  return rawPath
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(aestific-files|nvelora-files)\//i, '')
    .replace(/^\/+/, '');
}

/**
 * 30-Day History & Data Retention Automatic Cleanup Engine
 * 
 * Reliability & Data Integrity Guarantees:
 * 1. Calculated strictly per-message/file creation timestamp (createdAt < now - retentionDays).
 * 2. Fresh records (< retentionDays) are NEVER touched.
 * 3. Expired messages older than cutoff are deleted.
 * 4. Pinned conversations are NOT exempt — expired messages are purged according to policy.
 * 5. Conversations are deleted ONLY if they have zero messages remaining and were created before cutoff.
 * 6. Supabase Storage failure MUST NEVER cause data loss:
 *    - An expired DB file record is deleted IF AND ONLY IF its storage object deletion is positively confirmed
 *      or the storage provider confirms the object was already missing.
 *    - If storage deletion fails or throws an exception, the DB file record MUST BE PRESERVED.
 *    - Preserved records retain full storagePath, bucketName, and metadata for retry on subsequent runs.
 * 7. Missing/already-deleted storage objects are handled idempotently without blocking cleanup.
 * 8. Concurrency guard prevents duplicate simultaneous executions across Cloud Run instances or local timers.
 * 9. Sanitized audit logging (strictly NO passwords, tokens, API keys, or user data).
 */
export async function run30DayRetentionCleanup(
  retentionDays = RETENTION_DAYS,
  options?: { triggerSource?: string; forceLock?: boolean }
): Promise<RetentionCleanupSummary> {
  const startedAt = new Date().toISOString();
  const cutoffTime = Date.now() - retentionDays * 24 * 3600 * 1000;
  const cutoffDate = new Date(cutoffTime).toISOString();
  const triggerSource = options?.triggerSource || 'System';

  // 1. Process-local concurrency protection
  if (isProcessCleanupRunning && !options?.forceLock) {
    console.warn(`[Retention Engine] Cleanup requested by ${triggerSource} skipped: run already active in current process.`);
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      retentionDays,
      cutoffDate,
      messagesFound: 0,
      deletedMessagesCount: 0,
      deletedConversationsCount: 0,
      deletedFilesCount: 0,
      deletedStorageObjectsCount: 0,
      preservedFilesCount: 0,
      success: true,
      skipped: true,
      reason: 'Cleanup operation already running in this process',
    };
  }

  // 2. Distributed concurrency protection across Cloud Run instances via database lock
  const instanceId = `instance_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  let lockAcquired = false;
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (typeof db.getMode === 'function' && db.getMode() === 'production-d1');

  if (!db.acquireLock && isProduction && !options?.forceLock) {
    console.error(
      `[Retention Engine] Cleanup requested by ${triggerSource} skipped: authoritative distributed lock mechanism unavailable in production mode.`
    );
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      retentionDays,
      cutoffDate,
      messagesFound: 0,
      deletedMessagesCount: 0,
      deletedConversationsCount: 0,
      deletedFilesCount: 0,
      deletedStorageObjectsCount: 0,
      preservedFilesCount: 0,
      success: false,
      skipped: true,
      reason: 'Authoritative distributed lock mechanism is unavailable in production mode',
      error: 'Distributed lock unavailable in production mode',
    };
  }

  if (db.acquireLock && !options?.forceLock) {
    try {
      const lockRes = await db.acquireLock('retention_cleanup', instanceId, 300000); // 5-minute TTL
      if (!lockRes.acquired) {
        console.warn(
          `[Retention Engine] Cleanup requested by ${triggerSource} skipped: lock held by another instance (${lockRes.currentHolder || 'unknown'}).`
        );
        return {
          startedAt,
          completedAt: new Date().toISOString(),
          retentionDays,
          cutoffDate,
          messagesFound: 0,
          deletedMessagesCount: 0,
          deletedConversationsCount: 0,
          deletedFilesCount: 0,
          deletedStorageObjectsCount: 0,
          preservedFilesCount: 0,
          success: true,
          skipped: true,
          reason: `Cleanup lock held by another instance (${lockRes.currentHolder || 'unknown'})`,
        };
      }
      lockAcquired = true;
    } catch (lockErr: any) {
      if (isProduction) {
        const errMsg = lockErr?.message || String(lockErr);
        console.error(
          `[Retention Engine] Distributed retention lock error in production mode: ${errMsg}. Refusing to proceed without authoritative lock.`
        );
        return {
          startedAt,
          completedAt: new Date().toISOString(),
          retentionDays,
          cutoffDate,
          messagesFound: 0,
          deletedMessagesCount: 0,
          deletedConversationsCount: 0,
          deletedFilesCount: 0,
          deletedStorageObjectsCount: 0,
          preservedFilesCount: 0,
          success: false,
          skipped: true,
          reason: `Authoritative distributed lock check failed: ${errMsg}`,
          error: `Distributed lock check failed: ${errMsg}`,
        };
      }
      console.warn('[Retention Engine] Notice checking distributed lock, proceeding with process lock:', lockErr?.message || lockErr);
    }
  }

  isProcessCleanupRunning = true;
  console.log(`[Retention Engine] Cleanup started by ${triggerSource}. Policy: ${retentionDays} days. Cutoff: ${cutoffDate}`);

  let deletedConversationsCount = 0;
  let deletedMessagesCount = 0;
  let messagesFound = 0;
  let deletedFilesCount = 0;
  let deletedStorageObjectsCount = 0;
  const preserveFileIds = new Set<string>();

  try {
    // 1. Identify all expired files older than retention policy
    const allFiles = db.getAllFiles ? await db.getAllFiles() : [];
    const expiredFiles = allFiles.filter((f) => {
      if (!f.createdAt) return false;
      const fileTime = new Date(f.createdAt).getTime();
      return !isNaN(fileTime) && fileTime < cutoffTime;
    });

    // Map expired files and require storage deletion proof before DB record deletion
    const fileStorageMap = new Map<string, {
      file: typeof expiredFiles[0];
      cleanPath: string | null;
      bucket: string;
      requiresStorageDeletion: boolean;
    }>();

    const itemsToDelete: Array<{ storagePath: string; uniqueFileId?: string; bucketName?: string }> = [];

    for (const file of expiredFiles) {
      const rawPath = file.storagePath || (file.filename && file.userId ? `users/${file.userId}/${file.filename}` : file.filename || '');
      const cleanPath = normalizeStoragePath(rawPath);
      const bucket = (file.bucketName || 'aestific-files').trim().replace(/^\/+|\/+$/g, '') || 'aestific-files';
      const requiresStorage = Boolean(cleanPath && (file.storageProvider as string) !== 'none');

      fileStorageMap.set(file.id, {
        file,
        cleanPath: requiresStorage ? cleanPath : null,
        bucket,
        requiresStorageDeletion: requiresStorage,
      });

      if (requiresStorage) {
        // CRITICAL DATA INTEGRITY INVARIANT:
        // Assume file is PRESERVED by default until Supabase Storage positively confirms deletion.
        // If storage deletion throws, times out, or fails, preserveFileIds remains set and DB record stays intact!
        preserveFileIds.add(file.id);
        itemsToDelete.push({
          storagePath: file.storagePath || cleanPath,
          uniqueFileId: file.filename,
          bucketName: bucket,
        });
      }
    }

    // 2. Perform bulk storage deletion if items exist
    if (itemsToDelete.length > 0) {
      try {
        const storageResult = await bulkDeleteFromSupabaseStorage(itemsToDelete);
        deletedStorageObjectsCount = storageResult.storageObjectsDeleted || storageResult.deletedCount || 0;

        if (storageResult.errors && storageResult.errors.length > 0) {
          console.warn(
            `[Retention Engine] Supabase Storage partial notices (${storageResult.errors.length}):`,
            storageResult.errors
          );
        }

        const successfulPathSet = new Set(
          (storageResult.successfulPaths || []).map((p) => normalizeStoragePath(p))
        );
        const failedPathSet = new Set(
          (storageResult.failedPaths || []).map((p) => normalizeStoragePath(p))
        );

        // Positively verify each file's storage deletion status
        for (const [fileId, info] of fileStorageMap.entries()) {
          if (!info.requiresStorageDeletion || !info.cleanPath) {
            // File had no storage object, safe to remove from preserve list
            preserveFileIds.delete(fileId);
            continue;
          }

          // A file DB record may ONLY be deleted if:
          // 1. Its storage path was successfully deleted / confirmed missing by storage client
          // 2. AND its storage path did NOT encounter a deletion failure
          if (successfulPathSet.has(info.cleanPath) && !failedPathSet.has(info.cleanPath)) {
            // Storage object safely removed or verified missing: safe to remove from DB
            preserveFileIds.delete(fileId);
          } else {
            // Storage deletion failed or unconfirmed: keep in preserveFileIds for retry
            console.warn(
              `[Retention Engine] Preserving DB record for expired file ${fileId} (${info.cleanPath}): storage deletion unconfirmed or failed. Will retry next run.`
            );
          }
        }
      } catch (storageErr: any) {
        // Storage operation threw an unexpected exception!
        // Because preserveFileIds was populated ahead of time, every file requiring storage deletion
        // remains preserved in the database. ZERO data loss!
        console.error(
          `[Retention Engine] Supabase Storage bulk deletion threw unexpected exception: ${storageErr?.message || storageErr}. Preserving all ${preserveFileIds.size} expired file records in DB for retry.`
        );
      }
    }

    // 3. Remove expired file records from database (ONLY if NOT in preserveFileIds)
    for (const file of expiredFiles) {
      if (!preserveFileIds.has(file.id)) {
        await db.deleteFileRecord(file.id, file.userId);
        deletedFilesCount++;
      }
    }

    // 4. Clean expired messages (per-message createdAt) & purge empty conversations
    const historyResult = await db.cleanupOldHistory(retentionDays, preserveFileIds);
    messagesFound = historyResult.messagesFound;
    deletedMessagesCount = historyResult.deletedMessagesCount;
    deletedConversationsCount = historyResult.deletedConversationsCount;

    const completedAt = new Date().toISOString();

    // Log structured audit trail (strictly sanitized)
    try {
      await db.addAdminLog({
        adminName: triggerSource,
        ip: '127.0.0.1',
        action: '30_DAY_RETENTION_CLEANUP',
        details: `Purged ${deletedMessagesCount} messages (> ${retentionDays}d), ${deletedConversationsCount} empty conversations, and ${deletedFilesCount} files (preserved: ${preserveFileIds.size}). Cutoff: ${cutoffDate}`,
      });
    } catch (logErr: any) {
      console.warn('[Retention Engine] Notice writing admin audit log:', logErr?.message || logErr);
    }

    console.log(
      `[Retention Engine] Cleanup completed. Cutoff: ${cutoffDate} | Messages: ${deletedMessagesCount} | Empty convs: ${deletedConversationsCount} | Files deleted: ${deletedFilesCount} | Files preserved for retry: ${preserveFileIds.size}`
    );

    return {
      startedAt,
      completedAt,
      retentionDays,
      cutoffDate,
      messagesFound,
      deletedMessagesCount,
      deletedConversationsCount,
      deletedFilesCount,
      deletedStorageObjectsCount,
      preservedFilesCount: preserveFileIds.size,
      success: true,
    };
  } catch (err: any) {
    const errorMsg = err?.message || 'Unknown retention cleanup error';
    console.error(`[Retention Engine] Cleanup error at cutoff ${cutoffDate}:`, errorMsg);
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      retentionDays,
      cutoffDate,
      messagesFound: 0,
      deletedMessagesCount: 0,
      deletedConversationsCount: 0,
      deletedFilesCount: 0,
      deletedStorageObjectsCount: 0,
      preservedFilesCount: preserveFileIds.size,
      success: false,
      error: errorMsg,
    };
  } finally {
    isProcessCleanupRunning = false;
    if (lockAcquired && db.releaseLock) {
      try {
        await db.releaseLock('retention_cleanup', instanceId);
      } catch (relErr: any) {
        console.warn('[Retention Engine] Notice releasing retention lock:', relErr?.message || relErr);
      }
    }
  }
}

/**
 * Best-effort process-local timer safety net.
 * 
 * NOTE FOR CLOUD RUN PRODUCTION ARCHITECTURE:
 * Cloud Run instances are stateless and subject to scale-to-zero, cold-starts,
 * and ephemeral lifecycle restarts where setInterval cannot guarantee daily execution.
 * 
 * Therefore, the AUTHORITATIVE production scheduling mechanism is Google Cloud Scheduler
 * dispatching authenticated HTTP POST requests to /api/cron/retention-cleanup (or /api/admin/retention-cleanup).
 * 
 * This in-process timer serves as a local best-effort safety net during continuous container uptime.
 */
export function initRetentionCronSchedule() {
  // Warm-up run after 30 seconds of uptime
  const initialTimer = setTimeout(() => {
    run30DayRetentionCleanup(RETENTION_DAYS, { triggerSource: 'LocalWarmupSafetyNet' }).catch((err) => {
      console.warn('[Retention Engine] Local warmup safety net notice:', err?.message || err);
    });
  }, 30000);

  // Best-effort 24-hour interval for continuously running containers
  const intervalTimer = setInterval(() => {
    run30DayRetentionCleanup(RETENTION_DAYS, { triggerSource: 'LocalIntervalSafetyNet' }).catch((err) => {
      console.warn('[Retention Engine] Local interval safety net notice:', err?.message || err);
    });
  }, 24 * 3600 * 1000);

  if (initialTimer && typeof initialTimer.unref === 'function') initialTimer.unref();
  if (intervalTimer && typeof intervalTimer.unref === 'function') intervalTimer.unref();

  return { initialTimer, intervalTimer };
}

export { initRetentionCronSchedule as initLocalRetentionSafetyNet };
