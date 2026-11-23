import nodemailer from "nodemailer";

export interface LeaveEmailPayload {
  applicantName: string;
  applicantEmail?: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason?: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function calculateTotalDays(startDate: string, endDate: string): number {
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 1;
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendLeaveNotificationToManager(payload: LeaveEmailPayload) {
  const managerEmail = process.env.MANAGER_EMAIL;
  if (!managerEmail) {
    throw new Error("MANAGER_EMAIL is not set in backend .env");
  }

  const totalDays = calculateTotalDays(payload.startDate, payload.endDate);
  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
  const reviewUrl = `${frontendUrl}/leaves`;

  const safeName = escapeHtml(payload.applicantName);
  const safeEmail = payload.applicantEmail ? escapeHtml(payload.applicantEmail) : "";
  const safeType = escapeHtml(payload.leaveType);
  const safeStart = escapeHtml(payload.startDate);
  const safeEnd = escapeHtml(payload.endDate);
  const safeReason = payload.reason ? escapeHtml(payload.reason) : "No reason provided";
  const safeAttachmentName = escapeHtml(payload.attachmentName || "View Attached Document");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: #18181b; color: #ffffff; padding: 20px 24px;">
        <h2 style="margin: 0; font-size: 18px;">New Leave Application</h2>
        <p style="margin: 4px 0 0; font-size: 13px; color: #a1a1aa;">Action required in Collabix Workspace</p>
      </div>

      <div style="padding: 24px; color: #1f2937; font-size: 14px; line-height: 1.6;">
        <p style="margin-top: 0;">
          <strong>${safeName}</strong>${safeEmail ? ` (<a href="mailto:${safeEmail}" style="color: #2563eb; text-decoration: none;">${safeEmail}</a>)` : ""} has submitted a new leave request.
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: #f9fafb; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; font-weight: 600; width: 140px; color: #4b5563;">Leave Type</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb;">${safeType} Leave</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Duration</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb;">${safeStart} to ${safeEnd} (<strong>${totalDays} ${totalDays === 1 ? "day" : "days"}</strong>)</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Reason</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb;">${safeReason}</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; font-weight: 600; color: #4b5563;">Attachment</td>
            <td style="padding: 10px 14px;">
              ${
                payload.attachmentUrl
                  ? `<a href="${escapeHtml(payload.attachmentUrl)}" target="_blank" style="color: #2563eb; font-weight: 600; text-decoration: underline;">${safeAttachmentName}</a>`
                  : `<span style="color: #9ca3af;">None attached</span>`
              }
            </td>
          </tr>
        </table>

        <div style="margin-top: 24px;">
          <a href="${reviewUrl}" style="display: inline-block; background: #18181b; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 13px;">
            Review &amp; Approve Leave →
          </a>
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Collabix Leaves" <${process.env.SMTP_USER}>`,
    to: managerEmail,
    replyTo: payload.applicantEmail,
    subject: `Leave Request: ${payload.applicantName} (${payload.leaveType} — ${totalDays}d)`,
    html,
  });
}