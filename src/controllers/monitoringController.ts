import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const uploadDir = path.resolve(process.cwd(), "uploads/screenshots");

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage engine configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `screenshot-${req.user?.id || "unknown"}-${uniqueSuffix}${ext}`);
  }
});

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images are allowed."));
    }
  }
});

import { uploadToR2, deleteFromR2 } from "../services/storageService.js";

export class MonitoringController {
  static async uploadScreenshot(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ error: { message: "No file uploaded", status: 400 } });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: { message: "Unauthorized", status: 401 } });
        return;
      }

      const userId = req.user.id;
      const filename = req.file.filename;
      let screenshotPath = `/uploads/screenshots/${filename}`;

      // Upload to Cloudflare R2 if configured
      if (process.env.CLOUDFLARE_R2_ACCESS_KEY_ID && process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY) {
        try {
          const fileBuffer = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);
          if (fileBuffer) {
            screenshotPath = await uploadToR2(
              "screenshots",
              fileBuffer,
              filename,
              req.file.mimetype || "image/jpeg"
            );
          }
        } catch (r2Error) {
          console.error("[Cloudflare R2] Upload warning, falling back to disk:", r2Error);
        }
      }

      const statusParam = (req.body?.status === "inactive" || req.body?.status === "idle") ? "inactive" : "active";

      // Calculate exact duration since previous capture
      const prevLogRes = await db.query(
        `SELECT captured_at, status FROM screen_logs WHERE user_id = $1 ORDER BY captured_at DESC LIMIT 1;`,
        [userId]
      );
      let durationSeconds = 0;
      if (prevLogRes.rows.length > 0) {
        const prev = prevLogRes.rows[0];
        if (prev.status === "active" || prev.status === "inactive") {
          const elapsed = Date.now() - new Date(prev.captured_at).getTime();
          if (elapsed > 0 && elapsed <= 15 * 60 * 1000) {
            durationSeconds = Math.min(600, Math.floor(elapsed / 1000));
          }
        }
      }

      // Insert log into the database
      const result = await db.query(
        `INSERT INTO screen_logs (user_id, screenshot_path, status, duration_seconds)
         VALUES ($1, $2, $3, $4)
         RETURNING id, captured_at;`,
        [userId, screenshotPath, statusParam, durationSeconds]
      );

      res.status(200).json({
        message: "Screenshot successfully logged.",
        data: {
          id: result.rows[0].id,
          screenshotPath,
          capturedAt: result.rows[0].captured_at
        }
      });
    } catch (error) {
      next(error);
    }
  }

  static async getScreenshots(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ error: { message: "Unauthorized", status: 401 } });
        return;
      }

      const userId = req.user.id;
      const roleRank = req.user.role_rank ?? 4;
      const orgId = req.user.organization_id || null;

      let result;
      // Admins and Managers can see all screenshots in their organization
      if (roleRank <= 2) {
        result = await db.query(
          `SELECT sl.id, sl.screenshot_path, sl.captured_at, sl.display_width, sl.display_height, sl.status, sl.duration_seconds, u.name as user_name, u.email as user_email
           FROM screen_logs sl
           JOIN users u ON sl.user_id = u.id
           WHERE u.organization_id IS NOT DISTINCT FROM $1
             AND sl.screenshot_path != 'SESSION_STOPPED'
           ORDER BY sl.captured_at DESC
           LIMIT 50;`,
          [orgId]
        );
      } else {
        // Regular teammates can only retrieve their own logs
        result = await db.query(
          `SELECT sl.id, sl.screenshot_path, sl.captured_at, sl.display_width, sl.display_height, sl.status, sl.duration_seconds, u.name as user_name, u.email as user_email
           FROM screen_logs sl
           JOIN users u ON sl.user_id = u.id
           WHERE sl.user_id = $1
             AND sl.screenshot_path != 'SESSION_STOPPED'
           ORDER BY sl.captured_at DESC
           LIMIT 50;`,
          [userId]
        );
      }

      res.status(200).json(result.rows);
    } catch (error) {
      next(error);
    }
  }

  static async stopMonitoring(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ error: { message: "Unauthorized", status: 401 } });
        return;
      }

      const prevLogRes = await db.query(
        `SELECT captured_at, status FROM screen_logs WHERE user_id = $1 ORDER BY captured_at DESC LIMIT 1;`,
        [req.user.id]
      );
      let durationSeconds = 0;
      if (prevLogRes.rows.length > 0) {
        const prev = prevLogRes.rows[0];
        if (prev.status === "active" || prev.status === "inactive") {
          const elapsed = Date.now() - new Date(prev.captured_at).getTime();
          if (elapsed > 0 && elapsed <= 15 * 60 * 1000) {
            durationSeconds = Math.min(600, Math.floor(elapsed / 1000));
          }
        }
      }

      await db.query(
        `INSERT INTO screen_logs (user_id, screenshot_path, status, duration_seconds)
         VALUES ($1, 'SESSION_STOPPED', 'stopped', $2);`,
        [req.user.id, durationSeconds]
      );

      res.status(200).json({ message: "Monitoring stopped successfully." });
    } catch (error) {
      next(error);
    }
  }

  static async startSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { device_uuid, timestamp } = req.body;
      const session_id = `mock-session-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      console.log(`[API Mock] Start Session: Device ${device_uuid} | Session ID: ${session_id}`);
      res.status(200).json({ success: true, session_id });
    } catch (error) {
      next(error);
    }
  }

  static async stopSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { session_id, device_uuid } = req.body;
      console.log(`[API Mock] Stop Session: Session ${session_id} on Device ${device_uuid}`);
      res.status(200).json({ success: true, message: "Session stopped successfully." });
    } catch (error) {
      next(error);
    }
  }

  static async heartbeatSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { device_id, session_id, agent_version, timestamp, monitoring_status } = req.body;
      console.log(`[API Mock] Heartbeat: Device ${device_id} | Session ${session_id} | Status: ${monitoring_status} | Version: ${agent_version}`);
      res.status(200).json({ success: true, message: "Heartbeat acknowledged." });
    } catch (error) {
      next(error);
    }
  }

  static async deleteScreenshot(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ error: { message: "Unauthorized", status: 401 } });
        return;
      }

      const { id } = req.params;
      const userId = req.user.id;
      const roleRank = req.user.role_rank ?? 4;

      // Find the log entry
      const logResult = await db.query(
        "SELECT user_id, screenshot_path FROM screen_logs WHERE id = $1;",
        [id]
      );

      if (logResult.rows.length === 0) {
        res.status(404).json({ error: { message: "Log not found", status: 404 } });
        return;
      }

      const log = logResult.rows[0];

      // Check permissions: users can delete their own logs, managers/admins can delete any
      if (roleRank > 2 && log.user_id !== userId) {
        res.status(403).json({ error: { message: "Forbidden", status: 403 } });
        return;
      }

      // Instead of hard-deleting the row (which alters logged worked time),
      // we soft-delete by setting the screenshot_path to 'DELETED'
      await db.query("UPDATE screen_logs SET screenshot_path = 'DELETED' WHERE id = $1;", [id]);

      // Delete file from Cloudflare R2 or local disk
      if (log.screenshot_path.startsWith("http://") || log.screenshot_path.startsWith("https://")) {
        await deleteFromR2(log.screenshot_path);
      } else {
        const filePath = path.resolve(process.cwd(), log.screenshot_path.replace(/^\//, ""));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      res.status(200).json({ message: "Screenshot deleted successfully." });
    } catch (error) {
      next(error);
    }
  }
}
