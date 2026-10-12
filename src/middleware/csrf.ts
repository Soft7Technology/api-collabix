import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { config } from "../config/index.js";

/**
 * Double-submit cookie pattern CSRF protection middleware.
 * Skips validation for GET, HEAD, and OPTIONS.
 * Checks that the incoming X-CSRF-Token header matches the csrf_token cookie.
 */
export function validateCSRF(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF check for Bearer token requests and server-to-server webhooks
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return next();
  }

  if (req.path === "/github/webhook" || req.originalUrl.includes("/github/webhook")) {
    return next();
  }

  // 1. Get or generate the CSRF token cookie
  let csrfCookie = req.cookies?.csrf_token;
  if (!csrfCookie) {
    csrfCookie = crypto.randomBytes(32).toString("hex");
    const isLocalhost = req.hostname === "localhost" || req.hostname === "127.0.0.1";
    res.cookie("csrf_token", csrfCookie, {
      httpOnly: false, // Must be readable by frontend axios interceptor
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      domain: isLocalhost ? undefined : (config.COOKIE_DOMAIN || undefined),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  // 2. Skip validation for read-only HTTP methods
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // 3. Secondary defense: validate Origin / Referer host on state-mutating requests
  const allowedOrigins = (config.FRONTEND_URLS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const requestOrigin = req.headers["origin"] as string | undefined;
  const requestReferer = req.headers["referer"] as string | undefined;
  const requestSource = requestOrigin || requestReferer;

  if (requestSource && allowedOrigins.length > 0) {
    const isAllowedOrigin = allowedOrigins.some((allowed) => {
      try {
        const allowedHost = new URL(allowed).host;
        const sourceHost = new URL(requestSource).host;
        return allowedHost === sourceHost;
      } catch {
        return false;
      }
    });

    if (!isAllowedOrigin) {
      res.status(403).json({
        error: {
          message: "CSRF verification failed: Request origin is not permitted.",
          code: "EBADCSRFTOKEN",
          status: 403,
        },
      });
      return;
    }
  }

  // 4. Validate header matches cookie for state-mutating methods (POST, PUT, PATCH, DELETE)
  const csrfHeader = (req.headers["x-csrf-token"] || req.headers["x-xsrf-token"]) as string | undefined;

  if (!csrfHeader || typeof csrfHeader !== "string") {
    res.status(403).json({
      error: {
        message: "CSRF verification failed: X-CSRF-Token header is missing.",
        code: "EBADCSRFTOKEN",
        status: 403,
      },
    });
    return;
  }

  const cookieBuf = Buffer.from(String(csrfCookie));
  const headerBuf = Buffer.from(String(csrfHeader));

  if (
    cookieBuf.length !== headerBuf.length ||
    !crypto.timingSafeEqual(cookieBuf, headerBuf)
  ) {
    res.status(403).json({
      error: {
        message: "CSRF verification failed: Token mismatch between header and cookie.",
        code: "EBADCSRFTOKEN",
        status: 403,
      },
    });
    return;
  }

  next();
}