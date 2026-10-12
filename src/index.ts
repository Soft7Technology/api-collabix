import type { Server } from "http";
import app from "./app.js";
import { config } from "./config/index.js";
import { runMigrations, pool } from "./db/index.js";
import {
  startCleanupScheduler,
  stopCleanupScheduler,
} from "./services/cleanupService.js";

let server: Server | null = null;
let isShuttingDown = false;

async function gracefulShutdown(signal: string, exitCode = 0) {
  if (isShuttingDown) {
    console.log(`⏳ Shutdown already in progress (${signal})...`);
    return;
  }
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}. Initiating graceful shutdown...`);

  // Force exit if cleanup takes longer than 10 seconds
  const forceExitTimer = setTimeout(() => {
    console.error("⚠️ Forced shutdown timeout exceeded. Terminating process immediately.");
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  try {
    // 1. Stop background schedulers
    stopCleanupScheduler();

    // 2. Stop accepting new HTTP connections and finish ongoing requests
    if (server) {
      await new Promise<void>((resolve) => {
        server?.close((err) => {
          if (err) {
            console.error("⚠️ Error while closing HTTP server:", err);
          } else {
            console.log("✅ HTTP server closed successfully.");
          }
          resolve();
        });
      });
    }

    // 3. Drain and close database connection pool
    try {
      await pool.end();
      console.log("✅ PostgreSQL connection pool drained and closed.");
    } catch (poolErr) {
      console.error("⚠️ Error while closing PostgreSQL connection pool:", poolErr);
    }

    console.log("👋 Graceful shutdown complete. Exiting.");
    process.exit(exitCode);
  } catch (err) {
    console.error("❌ Fatal error during graceful shutdown:", err);
    process.exit(1);
  }
}

// Register process crash & signal handlers
process.on("SIGINT", () => gracefulShutdown("SIGINT", 0));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM", 0));

process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  console.error("💥 Unhandled Promise Rejection at:", promise, "reason:", reason);
  gracefulShutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error: Error) => {
  console.error("💥 Uncaught Exception thrown:", error);
  gracefulShutdown("uncaughtException", 1);
});

async function startServer() {
  try {
    // Run DB migrations before starting server
    await runMigrations();

    // Start background database cleanup scheduler
    startCleanupScheduler();

    const port = config.PORT;
    server = app.listen(port, () => {
      console.log(
        `🚀 Server running in ${config.NODE_ENV} mode on port ${port}`,
      );
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
