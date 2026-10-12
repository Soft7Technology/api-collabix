import { Request, Response } from "express";
import nodemailer from "nodemailer";
import { query, queryOne } from "../../db/index.js";
import { config } from "../../config/index.js";
import { encryptToken, decryptToken } from "../../utils/crypto.js";

export interface SmtpSettings {
  provider: string;
  encryption: string;
  host: string;
  port: number;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  testRecipient: string;
}

// Dynamically extract defaults from env settings config to avoid hardcoded platform.io brand values
const defaultFromName = config.SMTP_FROM.includes("<")
  ? config.SMTP_FROM.split("<")[0].replace(/"/g, "").trim()
  : "Platform Alerts";

const defaultFromEmail = config.SMTP_FROM.includes("<")
  ? config.SMTP_FROM.split("<")[1].replace(/>/g, "").trim()
  : "no-reply@platform.io";

let inMemorySmtpSettings: SmtpSettings = {
  provider: "Custom SMTP",
  encryption: config.SMTP_SECURE ? "SSL" : "TLS (Recommended)",
  host: config.SMTP_HOST || "smtp.sendgrid.net",
  port: Number(config.SMTP_PORT) || 587,
  username: config.SMTP_USER || "",
  password: config.SMTP_PASS || "",
  fromName: defaultFromName,
  fromEmail: defaultFromEmail,
  replyTo: defaultFromEmail,
  testRecipient: defaultFromEmail,
};

export class SystemController {
  static async getSmtpSettings(req: Request, res: Response) {
    const orgId = (req.user as any)?.organization_id || "default";
    try {
      const row = await queryOne<any>(
        "SELECT * FROM system_smtp_settings WHERE id = $1",
        [orgId],
      );
      if (row) {
        return res.json({
          provider: row.provider,
          encryption: row.encryption,
          host: row.host,
          port: Number(row.port),
          username: row.username,
          password: row.password ? "••••••••" : "",
          fromName: row.from_name,
          fromEmail: row.from_email,
          replyTo: row.reply_to || "",
          testRecipient: row.test_recipient || "",
        });
      }
    } catch {
      // Fall back to in-memory store if database table doesn't exist yet
    }
    return res.json({
      ...inMemorySmtpSettings,
      password: inMemorySmtpSettings.password ? "••••••••" : "",
    });
  }

  static async updateSmtpSettings(req: Request, res: Response) {
    const orgId = (req.user as any)?.organization_id || "default";
    const {
      provider,
      encryption,
      host,
      port,
      username,
      password,
      fromName,
      fromEmail,
      replyTo,
      testRecipient,
    } = req.body;

    let encryptedPassword: string;
    if (password && password !== "••••••••") {
      encryptedPassword = encryptToken(password) || password;
    } else {
      // Keep existing password
      try {
        const existing = await queryOne<any>(
          "SELECT password FROM system_smtp_settings WHERE id = $1",
          [orgId],
        );
        encryptedPassword = existing?.password || inMemorySmtpSettings.password;
      } catch {
        encryptedPassword = inMemorySmtpSettings.password;
      }
    }

    inMemorySmtpSettings = {
      provider,
      encryption,
      host,
      port: Number(port),
      username,
      password: encryptedPassword,
      fromName,
      fromEmail,
      replyTo: replyTo || "",
      testRecipient: testRecipient || "",
    };

    try {
      await query(
        `CREATE TABLE IF NOT EXISTS system_smtp_settings (
          id VARCHAR PRIMARY KEY,
          provider VARCHAR NOT NULL,
          encryption VARCHAR NOT NULL,
          host VARCHAR NOT NULL,
          port INTEGER NOT NULL,
          username VARCHAR NOT NULL,
          password VARCHAR NOT NULL,
          from_name VARCHAR NOT NULL,
          from_email VARCHAR NOT NULL,
          reply_to VARCHAR,
          test_recipient VARCHAR,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,
      );

      await query(
        `INSERT INTO system_smtp_settings (id, provider, encryption, host, port, username, password, from_name, from_email, reply_to, test_recipient, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
          provider = EXCLUDED.provider,
          encryption = EXCLUDED.encryption,
          host = EXCLUDED.host,
          port = EXCLUDED.port,
          username = EXCLUDED.username,
          password = EXCLUDED.password,
          from_name = EXCLUDED.from_name,
          from_email = EXCLUDED.from_email,
          reply_to = EXCLUDED.reply_to,
          test_recipient = EXCLUDED.test_recipient,
          updated_at = CURRENT_TIMESTAMP`,
        [
          orgId,
          provider,
          encryption,
          host,
          Number(port),
          username,
          encryptedPassword,
          fromName,
          fromEmail,
          replyTo || "",
          testRecipient || "",
        ],
      );
    } catch (err) {
      console.warn("Could not save SMTP settings to database, using memory state:", err);
    }

    return res.json({
      message: "SMTP configuration updated successfully",
      settings: {
        ...inMemorySmtpSettings,
        password: "••••••••",
      },
    });
  }

  static async testSmtpConnection(req: Request, res: Response) {
    const {
      testRecipient,
      host,
      port,
      username,
      password,
      encryption,
      fromName,
      fromEmail,
    } = req.body;

    const userEmail = req.user?.email;
    const orgId = req.user?.organization_id;
    const isSuperAdmin = req.user?.is_super_admin;

    // Resolve target recipient with open relay protection
    let targetRecipient = testRecipient?.trim() || userEmail || fromEmail;

    // Prevent open spam relay abuse by restricting non-superadmins to organization addresses or their own email
    if (!isSuperAdmin) {
      const isSenderOrSelf = targetRecipient.toLowerCase() === userEmail?.toLowerCase() || targetRecipient.toLowerCase() === fromEmail?.toLowerCase();
      if (!isSenderOrSelf && orgId) {
        const memberRes = await queryOne<any>(
          "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND organization_id = $2 LIMIT 1;",
          [targetRecipient, orgId],
        );
        if (!memberRes) {
          targetRecipient = userEmail || fromEmail;
        }
      } else if (!isSenderOrSelf) {
        targetRecipient = userEmail || fromEmail;
      }
    }

    // Resolve password if masked or omitted
    let effectivePassword = password;
    if (!effectivePassword || effectivePassword === "••••••••") {
      try {
        const row = await queryOne<any>(
          "SELECT password FROM system_smtp_settings WHERE id = $1",
          [orgId || "default"],
        );
        if (row?.password) {
          effectivePassword = decryptToken(row.password) || row.password;
        } else {
          effectivePassword = inMemorySmtpSettings.password;
        }
      } catch {
        effectivePassword = inMemorySmtpSettings.password;
      }
    }

    try {
      const secure = encryption === "SSL" || Number(port) === 465;
      const transporter = nodemailer.createTransport({
        host: host,
        port: Number(port),
        secure: secure,
        auth: username && effectivePassword ? { user: username, pass: effectivePassword } : undefined,
      });

      // Verify socket connection
      await transporter.verify();

      // Send the test email
      await transporter.sendMail({
        from: `"${fromName || "Platform Alerts"}" <${fromEmail || "no-reply@platform.io"}>`,
        to: targetRecipient,
        subject: "SMTP Connection Test — SOFT7",
        html: `
          <div style="font-family: sans-serif; padding: 20px; line-height: 1.6; color: #111;">
            <h2 style="color: #10b981;">SMTP Connection Verified!</h2>
            <p>This is a test email sent from the Collabix workspace to confirm that your custom SMTP outgoing mail configuration is working correctly.</p>
            <p><strong>Configuration details:</strong></p>
            <ul>
              <li>SMTP Host: <code>${host}</code></li>
              <li>SMTP Port: <code>${port}</code></li>
              <li>Encryption: <code>${encryption}</code></li>
            </ul>
            <p>If you received this email, you are all set! You can save this configuration in the dashboard settings.</p>
          </div>
        `,
      });

      return res.json({
        success: true,
        message: `Test email sent successfully to ${targetRecipient}! SMTP server connection verified.`,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("❌ SMTP connection test failed:", err.message);
      return res.status(400).json({
        error: {
          message: `SMTP connection test failed: ${err.message || "Unknown error"}`,
          status: 400,
        },
      });
    }
  }

  static async deleteSmtpSettings(req: Request, res: Response) {
    const orgId = (req.user as any)?.organization_id || "default";
    try {
      await query(
        "DELETE FROM system_smtp_settings WHERE id = $1",
        [orgId],
      );
      return res.json({
        message: "SMTP configuration reset to system defaults successfully",
        settings: {
          ...inMemorySmtpSettings,
          password: inMemorySmtpSettings.password ? "••••••••" : "",
        },
      });
    } catch (err: any) {
      console.error("❌ Failed to delete SMTP settings:", err.message);
      return res.status(500).json({
        error: {
          message: "Failed to reset SMTP settings.",
          status: 500,
        },
      });
    }
  }

  static async getWhatsAppSettings(req: Request, res: Response) {
    const orgId = (req.user as any)?.organization_id || "default";
    try {
      const row = await queryOne<any>(
        "SELECT * FROM system_whatsapp_settings WHERE id = $1",
        [orgId],
      );
      if (row) {
        return res.json({
          enabled: !!row.enabled,
          phoneNumber: row.phone_number || "",
          apiKey: row.api_key ? "••••••••" : "",
        });
      }
    } catch {
      // Table doesn't exist or query failed, return defaults
    }
    return res.json({
      enabled: false,
      phoneNumber: "",
      apiKey: "",
    });
  }

  static async updateWhatsAppSettings(req: Request, res: Response) {
    const orgId = (req.user as any)?.organization_id || "default";
    const { enabled, phoneNumber, apiKey } = req.body;

    try {
      await query(
        `CREATE TABLE IF NOT EXISTS system_whatsapp_settings (
          id VARCHAR PRIMARY KEY,
          enabled BOOLEAN NOT NULL DEFAULT FALSE,
          phone_number VARCHAR,
          api_key VARCHAR,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,
      );

      let encryptedApiKey = apiKey;
      if (apiKey && apiKey !== "••••••••") {
        encryptedApiKey = encryptToken(apiKey) || apiKey;
      } else {
        const existing = await queryOne<any>(
          "SELECT api_key FROM system_whatsapp_settings WHERE id = $1",
          [orgId],
        );
        encryptedApiKey = existing?.api_key || "";
      }

      await query(
        `INSERT INTO system_whatsapp_settings (id, enabled, phone_number, api_key, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          phone_number = EXCLUDED.phone_number,
          api_key = EXCLUDED.api_key,
          updated_at = CURRENT_TIMESTAMP`,
        [orgId, !!enabled, phoneNumber || "", encryptedApiKey],
      );

      return res.json({
        message: "WhatsApp configuration saved successfully",
        settings: {
          enabled: !!enabled,
          phoneNumber: phoneNumber || "",
          apiKey: "••••••••",
        },
      });
    } catch (err: any) {
      console.error("❌ Failed to update WhatsApp settings:", err.message);
      return res.status(500).json({
        error: {
          message: `Failed to save WhatsApp settings: ${err.message || "Unknown error"}`,
          status: 500,
        },
      });
    }
  }

  static async deleteWhatsAppSettings(req: Request, res: Response) {
    const orgId = (req.user as any)?.organization_id || "default";
    try {
      await query(
        "DELETE FROM system_whatsapp_settings WHERE id = $1",
        [orgId],
      );
      return res.json({
        message: "WhatsApp configuration reset to defaults successfully",
        settings: {
          enabled: false,
          phoneNumber: "",
          apiKey: "",
        },
      });
    } catch (err: any) {
      console.error("❌ Failed to delete WhatsApp settings:", err.message);
      return res.status(500).json({
        error: {
          message: "Failed to reset WhatsApp settings.",
          status: 500,
        },
      });
    }
  }
}
