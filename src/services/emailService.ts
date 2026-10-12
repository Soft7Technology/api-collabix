import { config } from "../config/index.js";
import nodemailer from "nodemailer";
import { queryOne } from "../db/index.js";
import { decryptToken } from "../utils/crypto.js";

export interface EmailProvider {
  sendInvitationEmail(email: string, invitationUrl: string): Promise<void>;
  sendPasswordResetEmail(email: string, resetUrl: string): Promise<void>;
  sendLeaveStatusEmail(email: string, leaveType: string, startDate: string, endDate: string, status: string): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async sendInvitationEmail(
    email: string,
    invitationUrl: string,
  ): Promise<void> {
    console.info(`\n📧 Sending invitation email to ${email}`);
    console.info(
      `--------------------------------------------------------------------------------`,
    );
    console.info(`✉️  [Console Email] Invitation Link for ${email}:`);
    console.info(`\n${invitationUrl}\n`);
    console.info(
      `--------------------------------------------------------------------------------`,
    );
    console.info(`✅ Invitation email logged for ${email}\n`);
  }

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    console.info(`\n📧 Sending password reset email to ${email}`);
    console.info(
      `--------------------------------------------------------------------------------`,
    );
    console.info(`✉️  [Console Email] Password Reset Link for ${email}:`);
    console.info(`\n${resetUrl}\n`);
    console.info(
      `--------------------------------------------------------------------------------`,
    );
    console.info(`✅ Password reset email logged for ${email}\n`);
  }

  async sendLeaveStatusEmail(
    email: string,
    leaveType: string,
    startDate: string,
    endDate: string,
    status: string,
  ): Promise<void> {
    console.info(`\n📧 Sending leave status email to ${email}`);
    console.info(
      `--------------------------------------------------------------------------------`,
    );
    console.info(`✉️  [Console Email] Leave Request for ${leaveType} (${startDate} to ${endDate}) is ${status}`);
    console.info(
      `--------------------------------------------------------------------------------`,
    );
    console.info(`✅ Leave status email logged for ${email}\n`);
  }
}

async function getOrgIdForEmail(email: string): Promise<string> {
  try {
    const user = await queryOne<any>(
      "SELECT organization_id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))",
      [email]
    );
    return user?.organization_id || "default";
  } catch {
    return "default";
  }
}

export async function getDynamicTransporter(orgIdOrEmail: string): Promise<{ transporter: nodemailer.Transporter; from: string; fromName: string }> {
  let orgId = orgIdOrEmail;
  if (orgIdOrEmail && orgIdOrEmail.includes("@")) {
    orgId = await getOrgIdForEmail(orgIdOrEmail);
  }

  try {
    const row = await queryOne<any>(
      "SELECT * FROM system_smtp_settings WHERE id = $1",
      [orgId || 'default']
    );
    if (row) {
      const secure = row.encryption === "SSL" || Number(row.port) === 465;
      const decryptedPassword = decryptToken(row.password) || row.password;
      const transporter = nodemailer.createTransport({
        host: row.host,
        port: Number(row.port),
        secure: secure,
        auth: row.username && decryptedPassword ? { user: row.username, pass: decryptedPassword } : undefined,
      });
      const from = `"${row.from_name}" <${row.from_email}>`;
      return { transporter, from, fromName: row.from_name };
    }
  } catch (err) {
    console.warn("Error loading SMTP settings from database, using env fallback:", err);
  }

  // Fallback to static env configuration
  const user = config.SMTP_USER?.trim();
  const pass = config.SMTP_PASS?.trim();
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: user && pass ? { user, pass } : undefined,
  });

  // Extract name from SMTP_FROM (e.g. "Collabix Onboarding <no-reply@soft7.in>" -> "Collabix Onboarding")
  let fromName = "System";
  if (config.SMTP_FROM.includes("<")) {
    fromName = config.SMTP_FROM.split("<")[0].replace(/"/g, "").trim();
  }
  return { transporter, from: config.SMTP_FROM, fromName };
}

class SmtpEmailProvider implements EmailProvider {
  /**
   * Helper: Dispatches email in the background without blocking the caller HTTP request loop.
   */
  private dispatchMail(
    mailOptions: nodemailer.SendMailOptions,
    emailType: string,
    recipientEmail: string,
  ): void {
    setImmediate(async () => {
      try {
        const { transporter, from, fromName } = await getDynamicTransporter(recipientEmail);
        await transporter.sendMail({
          from: from,
          ...mailOptions,
        });
        console.log(`✅  ${emailType} email sent via SMTP to ${recipientEmail}`);
      } catch (error: any) {
        console.error(`❌  Failed to send ${emailType} email via SMTP to ${recipientEmail}:`, error.message);
      }
    });
  }

  async sendInvitationEmail(
    email: string,
    invitationUrl: string,
  ): Promise<void> {
    const fromName = "Collabix";
    this.dispatchMail(
      {
        to: email,
        subject: `Join your team on ${fromName}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; line-height: 1.6; color: #111;">
            <h2>${fromName} Onboarding</h2>
            <p>You have been invited to join the studio workspace.</p>
            <p>Please click the link below to set up your password and activate your account:</p>
            <p><a href="${invitationUrl}" style="background: #111; color: #fff; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block;">Set Up Password</a></p>
            <p style="font-size: 12px; color: #666; margin-top: 30px;">If the button doesn't work, copy and paste this URL into your browser:<br>${invitationUrl}</p>
          </div>
        `,
      },
      "Invitation",
      email,
    );
  }

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    const fromName = "Collabix";
    this.dispatchMail(
      {
        to: email,
        subject: `Reset your ${fromName} password`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; line-height: 1.6; color: #111;">
            <h2>Reset your password</h2>
            <p>You requested to reset your password for ${fromName}.</p>
            <p>Please click the link below to configure your new password:</p>
            <p><a href="${resetUrl}" style="background: #111; color: #fff; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a></p>
            <p style="font-size: 12px; color: #666; margin-top: 30px;">If the button doesn't work, copy and paste this URL into your browser:<br>${resetUrl}</p>
          </div>
        `,
      },
      "Password Reset",
      email,
    );
  }

  async sendLeaveStatusEmail(
    email: string,
    leaveType: string,
    startDate: string,
    endDate: string,
    status: string,
  ): Promise<void> {
    const fromName = "Collabix";
    const isApproved = status === "APPROVED";
    const statusLabel = isApproved ? "Approved" : "Rejected";
    this.dispatchMail(
      {
        to: email,
        subject: `Leave Application ${statusLabel} — ${fromName}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; line-height: 1.6; color: #111;">
            <h2 style="color: ${isApproved ? "#10b981" : "#ef4444"};">Leave Application Update</h2>
            <p>Your request for <strong>${leaveType} leave</strong> has been reviewed.</p>
            <table style="border-collapse: collapse; margin-top: 15px; margin-bottom: 15px; width: 100%; max-width: 400px;">
              <tr>
                <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #ddd; background: #fafafa;">Start Date:</td>
                <td style="padding: 8px 12px; border: 1px solid #ddd;">${startDate}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #ddd; background: #fafafa;">End Date:</td>
                <td style="padding: 8px 12px; border: 1px solid #ddd;">${endDate}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #ddd; background: #fafafa;">Status:</td>
                <td style="padding: 8px 12px; border: 1px solid #ddd; font-weight: bold; color: ${isApproved ? "#10b981" : "#ef4444"};">${statusLabel}</td>
              </tr>
            </table>
            <p>Thank you,</p>
            <p><strong>${fromName} Team</strong></p>
          </div>
        `,
      },
      "Leave Status",
      email,
    );
  }
}

export const emailService: EmailProvider =
  config.EMAIL_PROVIDER === "smtp"
    ? new SmtpEmailProvider()
    : new ConsoleEmailProvider();
