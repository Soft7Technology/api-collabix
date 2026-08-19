import { db } from "../db/index.js";
import fs from "fs";
import path from "path";

/**
 * Prunes screenshots, logs, heartbeats, and sessions older than 30 days
 */
export async function runDatabaseCleanup() {
  console.log("... [Cleanup Service] Starting daily database pruning routine...");
  try {
    // 1. Fetch screenshot logs older than 30 days to clean files on disk
    const oldLogs = await db.query(
      `SELECT id, screenshot_path FROM screen_logs WHERE captured_at < NOW() - INTERVAL '30 days';`
    );

    console.log(`... [Cleanup Service] Found ${oldLogs.rows.length} screenshots older than 30 days to prune.`);
    
    let deletedFilesCount = 0;
    for (const log of oldLogs.rows) {
      if (log.screenshot_path && !log.screenshot_path.startsWith("http") && log.screenshot_path !== "SESSION_STOPPED" && log.screenshot_path !== "DELETED") {
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

    // 2. Prune old records from database
    const pruneLogsRes = await db.query(`DELETE FROM screen_logs WHERE captured_at < NOW() - INTERVAL '30 days';`);
    const pruneHeartbeatsRes = await db.query(`DELETE FROM monitoring_heartbeats WHERE captured_at < NOW() - INTERVAL '30 days';`);
    const pruneSessionsRes = await db.query(`DELETE FROM monitoring_sessions WHERE started_at < NOW() - INTERVAL '30 days';`);

    console.log(`... [Cleanup Service] Pruned ${deletedFilesCount} files from disk.`);
    console.log(`... [Cleanup Service] Database records deleted: ${pruneLogsRes.rowCount || 0} screen logs, ${pruneHeartbeatsRes.rowCount || 0} heartbeats, ${pruneSessionsRes.rowCount || 0} sessions.`);
  } catch (err) {
    console.error("... [Cleanup Service] Failed to run database cleanup:", err);
  }
}

/**
 * Schedules the cleanup routine to run daily
 */
export function startCleanupScheduler() {
  // Run once on boot after 10 seconds to avoid startup latency
  setTimeout(() => {
    runDatabaseCleanup();
  }, 10000);

  // Run once every 24 hours (86,400,000 milliseconds)
  setInterval(() => {
    runDatabaseCleanup();
  }, 86400000);
}
