import { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const isProd = config.NODE_ENV === "production" || process.env.NODE_ENV === "production";
  const statusCode = err.statusCode || err.status || 500;

  // In production, prevent leaking internal stack traces / raw errors to server stderr
  if (isProd) {
    console.error(`[Error] ${req.method} ${req.originalUrl} - Status ${statusCode}: ${err.message || "Internal Server Error"}`);
  } else {
    console.error("💥 Error handled by middleware:", err.stack || err);
  }

  // Return generic error message for 500 in production to avoid leaking DB/system details
  const message =
    statusCode === 500 && isProd
      ? "Internal Server Error"
      : err.message || "Internal Server Error";

  const details = err.details || undefined;

  res.status(statusCode).json({
    error: {
      message,
      status: statusCode,
      ...(details ? { details } : {}),
    },
  });
}
