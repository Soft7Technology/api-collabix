import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { config } from "../config/index.js";

/**
 * Double-submit cookie pattern CSRF protection middleware.
 * Skips validation for GET, HEAD, and OPTIONS.
 * Checks that the incoming X-CSRF-Token header matches the csrf_token cookie.
 */
export function validateCSRF(req: Request, res: Response, next: NextFunction) {
  // 1. Get or generate the CSRF token cookie
  let csrfCookie = req.cookies?.csrf_token;
  if (!csrfCookie) {
    csrfCookie = crypto.randomBytes(32).toString("hex");
    res.cookie("csrf_token", csrfCookie, {
      httpOnly: false, // Must be readable by frontend axios interceptor
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      domain: config.COOKIE_DOMAIN || undefined,
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
    res.status(403).json({
      error: {
        message: "CSRF token validation failed or missing.",
        status: 403,
      },
    });
    return;
  }

  next();
}
