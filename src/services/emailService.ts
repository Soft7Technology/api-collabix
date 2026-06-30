import { config } from "../config/index.js";
import nodemailer from "nodemailer";

export interface EmailProvider {
  sendInvitationEmail(email: string, invitationUrl: string): Promise<void>;
  sendPasswordResetEmail(email: string, resetUrl: string): Promise<void>;
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
}

class SmtpEmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;

  constructor() {
    const user = config.SMTP_USER?.trim();
    const pass = config.SMTP_PASS?.trim();

    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async sendInvitationEmail(
    email: string,
    invitationUrl: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: config.SMTP_FROM,
        to: email,
        subject: "Join your team on Collabix",
        html: `
          <div style="font-family: sans-serif; padding: 20px; line-height: 1.6; color: #111;">
            <h2>Welcome to Collabix</h2>
            <p>You have been invited to join the studio workspace.</p>
            <p>Please click the link below to set up your password and activate your account:</p>
            <p><a href="${invitationUrl}" style="background: #111; color: #fff; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block;">Set Up Password</a></p>
            <p style="font-size: 12px; color: #666; margin-top: 30px;">If the button doesn't work, copy and paste this URL into your browser:<br>${invitationUrl}</p>
          </div>
        `,
      });
      console.log(`✅  Invitation email sent via SMTP to ${email}`);
    } catch (error) {
      console.error("❌  Failed to send invitation email via SMTP:", error);
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: config.SMTP_FROM,
        to: email,
        subject: "Reset your Collabix password",
        html: `
          <div style="font-family: sans-serif; padding: 20px; line-height: 1.6; color: #111;">
            <h2>Reset your password</h2>
            <p>You requested to reset your password for Collabix.</p>
            <p>Please click the link below to configure your new password:</p>
            <p><a href="${resetUrl}" style="background: #111; color: #fff; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a></p>
            <p style="font-size: 12px; color: #666; margin-top: 30px;">If the button doesn't work, copy and paste this URL into your browser:<br>${resetUrl}</p>
          </div>
        `,
      });
      console.log(`✅  Password reset email sent via SMTP to ${email}`);
    } catch (error) {
      console.error("❌  Failed to send password reset email via SMTP:", error);
      throw error;
    }
  }
}

export const emailService: EmailProvider =
  config.EMAIL_PROVIDER === "smtp"
    ? new SmtpEmailProvider()
    : new ConsoleEmailProvider();
