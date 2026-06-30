import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  console.error("💥 Error handled by middleware:", err.stack || err);

  const statusCode = err.statusCode || err.status || 500;

  // Return generic error message for 500 to avoid leaking DB details
  const message =
    statusCode === 500
      ? "Internal Server Error"
      : err.message || "Internal Server Error";

  res.status(statusCode).json({
    error: {
      message,
      status: statusCode,
    },
  });
}
