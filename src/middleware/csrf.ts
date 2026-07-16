import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";

export function validateCSRF(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    // Skip CSRF validation for safe methods
    const safeMethods = ["GET", "HEAD", "OPTIONS"];
    if (safeMethods.includes(req.method)) {
      return next();
    }

    // Skip CSRF validation for login/auth routes if desired
    const excludedRoutes = [
      "/auth/login",
      "/auth/register",
      "/auth/refresh-token",
    ];

    if (excludedRoutes.includes(req.path)) {
      return next();
    }

    // Skip CSRF for Bearer token clients (Postman, mobile apps, APIs)
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith("Bearer ")) {
      return next();
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