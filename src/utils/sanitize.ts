/**
 * Sanitizes user-provided text/HTML/Markdown content to prevent Cross-Site Scripting (XSS).
 * Strips active scripts, dangerous tags, malicious attributes, javascript: and data: URLs, and event handlers.
 */
export function sanitizeContent(input: string | undefined | null): string {
  if (!input || typeof input !== "string") return "";

  let sanitized = input;

  // 1. Strip script tags and their inner contents
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // 2. Strip style tags and their inner contents
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // 3. Strip iframe, object, embed, applet, meta, link, form, input, button, svg, math, base, frame, frameset tags
  const dangerousTags = [
    "iframe",
    "object",
    "embed",
    "applet",
    "meta",
    "link",
    "form",
    "input",
    "button",
    "svg",
    "math",
    "base",
    "frame",
    "frameset",
  ];

  for (const tag of dangerousTags) {
    const regex = new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, "gi");
    sanitized = sanitized.replace(regex, "");
    // Also handle self-closing / unclosed tags
    const selfClosingRegex = new RegExp(`<${tag}\\b[^>]*>`, "gi");
    sanitized = sanitized.replace(selfClosingRegex, "");
  }

  // 4. Strip dangerous inline event handlers (on* like onerror=, onload=, onclick=, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*(['"]).*?\1/gi, "");
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]+/gi, "");

  // 5. Strip javascript:, vbscript:, and data:text/html URLs
  sanitized = sanitized.replace(/(javascript|vbscript|data\s*:\s*text\/html)\s*:/gi, "blocked-scheme:");

  // 6. Prevent HTML expression tricks (e.g. style="expression(...)")
  sanitized = sanitized.replace(/expression\s*\(.*?\)/gi, "blocked-expression");

  return sanitized.trim();
}

/**
 * Sanitizes attachment arrays ensuring names and URLs are safe
 */
export function sanitizeAttachments(
  attachments?: Array<{ name: string; url: string; size?: number; type?: string }> | null,
): Array<{ name: string; url: string; size?: number; type?: string }> {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .filter((att) => att && typeof att.url === "string" && typeof att.name === "string")
    .map((att) => {
      let safeUrl = att.url.trim();
      if (/^(javascript|vbscript|data:text\/html)/i.test(safeUrl)) {
        safeUrl = "#";
      }
      return {
        name: sanitizeContent(att.name).slice(0, 255) || "attachment",
        url: safeUrl,
        size: typeof att.size === "number" ? att.size : undefined,
        type: typeof att.type === "string" ? sanitizeContent(att.type).slice(0, 100) : undefined,
      };
    });
}
