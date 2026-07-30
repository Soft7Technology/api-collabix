import { Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { uploadToR2, r2Client } from "../services/storageService.js";

const storage = multer.memoryStorage();

export const attachmentMulter = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || "collabix";

export class UploadController {
  static async uploadAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ error: { message: "No file provided for upload.", status: 400 } });
        return;
      }

      const { originalname, mimetype, size, buffer } = req.file;

      let fileUrl = "";
      try {
        // Try uploading to Cloudflare R2 bucket
        fileUrl = await uploadToR2("attachments", buffer, originalname, mimetype);
        console.log(`[Cloudflare R2] Successfully uploaded attachment: ${originalname} -> ${fileUrl}`);
      } catch (r2Error) {
        console.error("[Cloudflare R2] Attachment upload failed, falling back to local disk storage:", r2Error);

        const uploadDir = path.resolve(process.cwd(), "uploads/attachments");
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const safeName = `${Date.now()}-${originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const filePath = path.join(uploadDir, safeName);
        fs.writeFileSync(filePath, buffer);

        const protocol = req.protocol || "https";
        const host = req.get("host") || "collabix.soft7.in";
        fileUrl = `${protocol}://${host}/uploads/attachments/${safeName}`;
      }

      res.status(201).json({
        name: originalname,
        url: fileUrl,
        size,
        type: mimetype,
      });
    } catch (error) {
      next(error);
    }
  }

  static async streamFile(req: Request, res: Response, next: NextFunction) {
    try {
      const key = (req.params as any)[0];
      if (!key) {
        res.status(400).json({ error: { message: "File key is required.", status: 400 } });
        return;
      }

      const isDownload = req.query.download === "true";
      const filename = path.basename(key);

      // Check if file exists locally in uploads/
      const localPath = path.resolve(process.cwd(), key.startsWith("uploads/") ? key : `uploads/${key}`);
      if (fs.existsSync(localPath)) {
        if (isDownload) {
          res.download(localPath, filename);
        } else {
          res.sendFile(localPath);
        }
        return;
      }

      // Stream from Cloudflare R2 bucket
      try {
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
        });

        const r2Response = await r2Client.send(command);
        if (!r2Response.Body) {
          res.status(404).json({ error: { message: "File not found.", status: 404 } });
          return;
        }

        if (r2Response.ContentType) {
          res.setHeader("Content-Type", r2Response.ContentType);
        }
        if (r2Response.ContentLength) {
          res.setHeader("Content-Length", r2Response.ContentLength);
        }

        const disposition = isDownload ? `attachment; filename="${filename}"` : "inline";
        res.setHeader("Content-Disposition", disposition);

        const stream = r2Response.Body as any;
        stream.pipe(res);
      } catch (r2Error: any) {
        console.error(`[R2 Proxy Error] Failed to stream ${key}:`, r2Error);
        res.status(404).json({ error: { message: "File not found on storage.", status: 404 } });
      }
    } catch (error) {
      next(error);
    }
  }
}
