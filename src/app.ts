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
import { SuperService } from "./services/superService.js";

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

// Middleware to enforce global maintenance mode (Super Admins bypass)
async function checkMaintenanceMode(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const user = req.user;
  if (user && user.is_super_admin) {
    return next();
  }

  try {
    const isMaintenance = await SuperService.isMaintenanceModeActive();
    if (isMaintenance) {
      res.setHeader("Retry-After", "300");
      res.status(503).json({
        error: {
          message: "The platform is currently undergoing scheduled maintenance. Please try again shortly.",
          code: "MAINTENANCE_MODE",
          status: 503,
        },
      });
      return;
    }
  } catch (err) {
    console.error("Failed to check maintenance mode:", err);
  }

  next();
}

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

  // Always allow support tickets, user profile updates, organization info, and auth operations
  // Even if trial/subscription is expired, clients MUST be able to talk to Super Admin support and manage billing!
  if (
    req.path.startsWith("/support") ||
    req.path.startsWith("/super") ||
    req.path.startsWith("/users") ||
    req.path.startsWith("/organization") ||
    req.baseUrl === "/auth"
  ) {
    return next();
  }

  const { subscription_status, trial_ends_at, is_approved } = user.organization || {};
  const status = (subscription_status || "").toLowerCase();

  // Block immediately if explicitly revoked
  if (status === "revoked") {
    res.status(402).json({
      error: {
        message: "Your workspace access was revoked by platform administrators.",
        code: "SUBSCRIPTION_REVOKED",
        status: 402,
      },
    });
    return;
  }

  // Active subscription check (approved or active status)
  if (status === "active" || status === "approved" || is_approved) {
    const now = new Date();
    const expiry = trial_ends_at ? new Date(trial_ends_at) : null;
    if (!expiry || isNaN(expiry.getTime()) || now < expiry) {
      return next();
    }
  }

  // Active trial check
  if (!subscription_status || status === "trial" || status === "trialing") {
    const now = new Date();
    const trialEnd = trial_ends_at ? new Date(trial_ends_at) : null;
    if (!trialEnd || isNaN(trialEnd.getTime()) || now < trialEnd) {
      return next();
    }
  }

  const expiryFormatted = trial_ends_at
    ? new Date(trial_ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "recently";

  res.status(402).json({
    error: {
      message: `Action Restricted: Your workspace subscription expired on ${expiryFormatted}. Read-only access is enabled. Please renew your plan to create or modify tasks, projects, or tracking sessions.`,
      code: "SUBSCRIPTION_EXPIRED",
      status: 402,
    },
  });
}

// Mount API routes (protected with auth, maintenance mode, subscription limits, and CSRF validation)
app.use("/api", authenticateUser, checkMaintenanceMode, checkSubscription, validateCSRF, apiRouter);

// Global Error Handler
app.use(errorHandler);

export default app;
export { app };
