import app from "./app.js";
import { config } from "./config/index.js";
import { runMigrations } from "./db/index.js";
import { startCleanupScheduler } from "./services/cleanupService.js";

async function startServer() {
  try {
    // Run DB migrations before starting server
    await runMigrations();

    // Start background database cleanup scheduler
    startCleanupScheduler();

    const port = config.PORT;
    app.listen(port, () => {
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
