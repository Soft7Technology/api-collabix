import { db } from "../db/index.js";
import fs from "fs";
import path from "path";
import { deleteFromR2 } from "./storageService.js";

/**
 * Scans a directory and removes files older than maxAgeMs to prevent unbounded disk growth.
 */
function pruneDirectoryOrphanFiles(dirPath: string, maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): number {
  let pruned = 0;
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const files = fs.readdirSync(dirPath);
    const now = Date.now();
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isFile() && now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
          pruned++;
        }
      } catch (fErr: any) {
        console.warn(`[Cleanup Service] Error checking file ${fullPath}:`, fErr.message);
      }
    }
  } catch (err: any) {
    console.warn(`[Cleanup Service] Error scanning directory ${dirPath}:`, err.message);
  }
  return pruned;
}

/**
 * Prunes screenshots, logs, heartbeats, and sessions older than 30 days
 */
export async function runDatabaseCleanup() {
  console.log("... [Cleanup Service] Starting daily database & storage pruning routine...");
  try {
    // 1. Fetch screenshot logs older than 30 days to clean files on disk and Cloudflare R2
    const oldLogs = await db.query(
      `SELECT id, screenshot_path FROM screen_logs WHERE captured_at < NOW() - INTERVAL '30 days';`
    );

    console.log(`... [Cleanup Service] Found ${oldLogs.rows.length} screenshots older than 30 days to prune.`);
    
    let deletedFilesCount = 0;
    let deletedR2Count = 0;
    for (const log of oldLogs.rows) {
      if (log.screenshot_path) {
        if (log.screenshot_path.startsWith("http://") || log.screenshot_path.startsWith("https://")) {
          // Cloudflare R2 remote file cleanup
          try {
            await deleteFromR2(log.screenshot_path);
            deletedR2Count++;
          } catch (r2Err: any) {
            console.warn(`[Cleanup Service] Warning: Failed to delete R2 screenshot ${log.screenshot_path}:`, r2Err.message);
          }
        } else if (log.screenshot_path !== "SESSION_STOPPED" && log.screenshot_path !== "DELETED") {
          // Local fallback file cleanup
          const filePath = path.resolve(process.cwd(), log.screenshot_path.replace(/^\//, ""));
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              deletedFilesCount++;
            }
          } catch (fileErr: any) {
            console.warn(`[Cleanup Service] Warning: Failed to delete local file ${filePath}:`, fileErr.message);
          }
        }
      }
    }

    // 2. Prune orphan files on local disk (e.g. uploads/screenshots/ and uploads/attachments/)
    const screenshotsDir = path.resolve(process.cwd(), "uploads/screenshots");
    const attachmentsDir = path.resolve(process.cwd(), "uploads/attachments");
    const prunedScreenshots = pruneDirectoryOrphanFiles(screenshotsDir);
    const prunedAttachments = pruneDirectoryOrphanFiles(attachmentsDir);

    // 3. Prune old records from database
    const pruneLogsRes = await db.query(`DELETE FROM screen_logs WHERE captured_at < NOW() - INTERVAL '30 days';`);
    const pruneHeartbeatsRes = await db.query(`DELETE FROM monitoring_heartbeats WHERE captured_at < NOW() - INTERVAL '30 days';`);
    const pruneSessionsRes = await db.query(`DELETE FROM monitoring_sessions WHERE started_at < NOW() - INTERVAL '30 days';`);

    console.log(`... [Cleanup Service] Pruned ${deletedFilesCount + prunedScreenshots} screenshot files and ${prunedAttachments} attachment files from disk.`);
    console.log(`... [Cleanup Service] Pruned ${deletedR2Count} Cloudflare R2 objects.`);
    console.log(`... [Cleanup Service] Database records deleted: ${pruneLogsRes.rowCount || 0} screen logs, ${pruneHeartbeatsRes.rowCount || 0} heartbeats, ${pruneSessionsRes.rowCount || 0} sessions.`);
  } catch (err) {
    console.error("... [Cleanup Service] Failed to run database cleanup:", err);
  }
}

let cleanupTimeout: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Schedules the cleanup routine to run daily
 */
export function startCleanupScheduler() {
  // Run once on boot after 10 seconds to avoid startup latency
  cleanupTimeout = setTimeout(() => {
    runDatabaseCleanup();
  }, 10000);

  // Run once every 24 hours (86,400,000 milliseconds)
  cleanupInterval = setInterval(() => {
    runDatabaseCleanup();
  }, 86400000);
}

/**
 * Stops the cleanup routine scheduler
 */
export function stopCleanupScheduler() {
  if (cleanupTimeout) {
    clearTimeout(cleanupTimeout);
    cleanupTimeout = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
