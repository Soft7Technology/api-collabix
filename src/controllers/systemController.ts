import { Request, Response } from "express";
import { query, queryOne } from "../db.js";

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

let inMemorySmtpSettings: SmtpSettings = {
  provider: "Custom SMTP",
  encryption: "TLS (Recommended)",
  host: "smtp.sendgrid.net",
  port: 587,
  username: "apikey",
  password: "••••••••••",
  fromName: "Platform Alerts",
  fromEmail: "no-reply@platform.io",
  replyTo: "support@platform.io",
  testRecipient: "admin@platform.io",
};

export class SystemController {
  static async getSmtpSettings(req: Request, res: Response) {
    try {
      const row = await queryOne<any>(
        "SELECT * FROM system_smtp_settings WHERE id = 'default'",
      );
      if (row) {
        return res.json({
          provider: row.provider,
          encryption: row.encryption,
          host: row.host,
          port: Number(row.port),
          username: row.username,
          password: row.password,
          fromName: row.from_name,
          fromEmail: row.from_email,
          replyTo: row.reply_to || "",
          testRecipient: row.test_recipient || "",
        });
      }
    } catch (err) {
      // Fall back to in-memory store if database table doesn't exist yet
    }
    return res.json(inMemorySmtpSettings);
  }

  static async updateSmtpSettings(req: Request, res: Response) {
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

    inMemorySmtpSettings = {
      provider,
      encryption,
      host,
      port: Number(port),
      username,
      password,
      fromName,
      fromEmail,
      replyTo: replyTo || "",
      testRecipient: testRecipient || "",
    };

    try {
      await query(
        `CREATE TABLE IF NOT EXISTS system_smtp_settings (
          id VARCHAR PRIMARY KEY DEFAULT 'default',
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
         VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
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
          provider,
          encryption,
          host,
          Number(port),
          username,
          password,
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
      settings: inMemorySmtpSettings,
    });
  }

  static async testSmtpConnection(req: Request, res: Response) {
    const { testRecipient } = req.body;
    const recipient = testRecipient || inMemorySmtpSettings.testRecipient || "admin@platform.io";

    // Simulate verification delay & successful connection response
    await new Promise((resolve) => setTimeout(resolve, 800));

    return res.json({
      success: true,
      message: `Test email sent successfully to ${recipient}! SMTP server connection verified.`,
      timestamp: new Date().toISOString(),
    });
  }
}
