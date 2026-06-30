import { Request, Response, NextFunction } from "express";

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimiter(windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Bypass rate limiting in test environments
    if (process.env.NODE_ENV === "test") {
      return next();
    }

    const ip =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      "unknown";
    // Key by IP address and the specific endpoint path to avoid locking a client out of all paths
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const record = rateLimitMap.get(key);

    if (!record) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (now > record.resetTime) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      res.status(429).json({
        error: {
          message: "Too many requests from this IP. Please try again later.",
          status: 429,
        },
      });
      return;
    }

    next();
  };
}
