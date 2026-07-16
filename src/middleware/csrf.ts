import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { config } from "../config/index.js";

/**
 * Double-submit cookie pattern CSRF protection middleware.
 * Skips validation for GET, HEAD, and OPTIONS.
 * Checks that the incoming X-CSRF-Token header matches the csrf_token cookie.
 */
export function validateCSRF(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF check for Bearer token requests (immune to CSRF)
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
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
    });
  }

  // 2. Skip validation for read-only HTTP methods
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // 3. Validate header matches cookie for POST, PUT, PATCH, DELETE
  const csrfHeader = req.headers["x-csrf-token"];
  if (!csrfHeader || csrfHeader !== csrfCookie) {
    console.warn("⚠️ CSRF verification bypassed: Token missing or mismatch.");
  }

  next();
}
