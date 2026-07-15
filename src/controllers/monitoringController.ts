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
      const screenshotPath = `/uploads/screenshots/${filename}`;

      // Insert log into the database
      const result = await db.query(
        `INSERT INTO screen_logs (user_id, screenshot_path, status)
         VALUES ($1, $2, 'active')
         RETURNING id, captured_at;`,
        [userId, screenshotPath]
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
          `SELECT sl.id, sl.screenshot_path, sl.captured_at, sl.display_width, sl.display_height, sl.status, u.name as user_name, u.email as user_email
           FROM screen_logs sl
           JOIN users u ON sl.user_id = u.id
           WHERE u.organization_id IS NOT DISTINCT FROM $1
           ORDER BY sl.captured_at DESC
           LIMIT 50;`,
          [orgId]
        );
      } else {
        // Regular teammates can only retrieve their own logs
        result = await db.query(
          `SELECT id, screenshot_path, captured_at, display_width, display_height, status
           FROM screen_logs
           WHERE user_id = $1
           ORDER BY captured_at DESC
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

      const userId = req.user.id;

      // Instantly mark active screen logs as inactive for this user
      await db.query(
        `UPDATE screen_logs SET status = 'inactive' WHERE user_id = $1 AND status = 'active';`,
        [userId]
      );

      res.status(200).json({ message: "Monitoring stopped successfully." });
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

      // Delete from database
      await db.query("DELETE FROM screen_logs WHERE id = $1;", [id]);

      // Delete file from disk if it exists
      const filePath = path.resolve(process.cwd(), log.screenshot_path.replace(/^\//, ""));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.status(200).json({ message: "Screenshot deleted successfully." });
    } catch (error) {
      next(error);
    }
  }
}
