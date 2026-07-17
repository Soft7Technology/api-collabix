import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
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

    // Skip CSRF validation for login/auth routes if desired
    const excludedRoutes = [
      "/auth/login",
      "/auth/register",
      "/auth/refresh-token",
    ];

  // 3. Validate header matches cookie for POST, PUT, PATCH, DELETE
  const csrfHeader = req.headers["x-csrf-token"];
  if (!csrfHeader || csrfHeader !== csrfCookie) {
    console.warn("⚠️ CSRF verification bypassed: Token missing or mismatch.");
  }

    const csrfCookie = req.cookies?.csrf_token;
    const csrfHeader = req.headers["x-csrf-token"] as string | undefined;

    // First request: generate CSRF cookie
    if (!csrfCookie) {
      const newToken = crypto.randomBytes(32).toString("hex");

      res.cookie("csrf_token", newToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        domain: config.COOKIE_DOMAIN || undefined,
      });

      return res.status(403).json({
        error: {
          message:
            "CSRF token generated. Retry request with x-csrf-token header.",
          status: 403,
        },
      });
    }

    // Validate header matches cookie
    if (!csrfHeader || csrfHeader !== csrfCookie) {
      return res.status(403).json({
        error: {
          message: "CSRF token validation failed.",
          status: 403,
        },
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}