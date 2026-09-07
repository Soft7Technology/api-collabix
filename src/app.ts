import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";
import { config } from "./config/index.js";
import { router as apiRouter } from "./routes/index.js";
import { router as authRouter } from "./routes/auth.js";
import { authenticateUser } from "./middleware/authenticate.js";
import { validateCSRF } from "./middleware/csrf.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

// Middlewares
app.use(helmet());
app.use(cookieParser());
app.use(express.json());

// Dev logs (morgan)
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Serve uploaded screenshots & attachments statically with cross-origin headers
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.resolve(process.cwd(), "uploads")),
);

const allowedOrigins = config.FRONTEND_URLS
  ? config.FRONTEND_URLS.split(",").map((o) => o.trim())
  : [config.FRONTEND_URL];

const isDev = process.env.NODE_ENV !== "production";

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or SSR fetch requests)
      if (!origin) return callback(null, true);

      // In development mode, allow any localhost or 127.0.0.1 port (e.g. 3000, 8001, 5173, etc.)
      if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        allowedOrigins.includes("*")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
// Health check endpoints
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount auth routes (unprotected)
app.use("/auth", authRouter);

// Middleware to enforce active SaaS subscriptions or active trial periods
function checkSubscription(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const user = req.user;
  if (!user || user.is_super_admin) {
    return next();
  }

  // Allow read-only GET access to view existing projects, tasks, and reports
  if (req.method === "GET") {
    return next();
  }

  const { subscription_status, trial_ends_at, is_approved } = user.organization || {};
  const status = (subscription_status || "").toLowerCase();

  // Block immediately if expired or revoked
  if (status === "expired" || status === "revoked") {
    res.status(402).json({
      error: {
        message: "Your subscription has expired or was revoked. Subscription required to restore access.",
        code: "SUBSCRIPTION_EXPIRED",
        status: 402,
      },
    });
    return;
  }

  // Active subscription check
  if (status === "active" || status === "approved") {
    const now = new Date();
    const expiry = trial_ends_at ? new Date(trial_ends_at) : null;
    if (!expiry || isNaN(expiry.getTime()) || now < expiry) {
      return next();
    }
  }

  // Active trial check
  if (!subscription_status || status === "trial" || status === "trialing" || is_approved) {
    const now = new Date();
    const trialEnd = trial_ends_at ? new Date(trial_ends_at) : null;
    if (!trialEnd || isNaN(trialEnd.getTime()) || now < trialEnd) {
      return next();
    }
  }

  res.status(402).json({
    error: {
      message: "Subscription Required: Free trial has ended. Please subscribe to restore access.",
      code: "SUBSCRIPTION_EXPIRED",
      status: 402,
    },
  });
}

// Mount API routes (protected with auth, subscription limits, and CSRF validation)
app.use("/api", authenticateUser, checkSubscription, validateCSRF, apiRouter);

// Global Error Handler
app.use(errorHandler);

export default app;
export { app };
