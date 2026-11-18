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
import { AuthController } from "./modules/auth/authController.js";
import { db } from "./db/index.js";
import { SuperService } from "./services/superService.js";

const app = express();

// Middlewares
app.use(helmet());
app.use(cookieParser());

app.post("/auth/subscription/webhook",
  express.raw({type: "application/json"}),
  AuthController.razorpayWebhook
)

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

async function checkSubscription(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  try {
    const user = req.user;

    if (!user || user.is_super_admin) {
      return next();
    }

    const organization = user.organization;

    if (!organization) {
      return res.status(403).json({
        error: {
          message: "Organization access is required.",
          code: "ORGANIZATION_REQUIRED",
          status: 403,
        },
      });
    }

    const {
      id: organizationId,
      subscription_status,
      trial_ends_at,
      is_approved,
    } = organization;

    const status = (subscription_status || "").toLowerCase();

    // Revoked organizations cannot access any API endpoint.
    if (status === "revoked") {
      return res.status(403).json({
        error: {
          message: "Your organization access has been revoked.",
          code: "ORGANIZATION_REVOKED",
          status: 403,
        },
      });
    }

    // Ordinary GET requests are read-only.
    // GitHub OAuth callback is also a GET, but must remain accessible
    // because it completes the OAuth integration.
    if (req.method === "GET") {
      return next();
    }

    const now = new Date();

    const isValidFutureDate = (value: unknown): boolean => {
      if (!value) return false;

      const date = new Date(value as string | number | Date);

      return !isNaN(date.getTime()) && date > now;
    };

    // 1. Check trial access.
    if (status === "trial" || status === "trialing") {
      if (isValidFutureDate(trial_ends_at)) {
        return next();
      }
    }

    // 2. Check paid subscription independently of approval.
    if (status === "active") {
      const { rows } = await db.query(
        `SELECT current_period_end
     FROM subscriptions
     WHERE organization_id = $1
       AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
        [organizationId],
      );

      const subscription = rows[0];

      if (subscription && isValidFutureDate(subscription.current_period_end)) {
        return next();
      }
    }

    // 3. Check temporary Super Admin approval.
    if (is_approved && status === "active") {
      if (isValidFutureDate(trial_ends_at)) {
        return next();
      }
    }

    return res.status(402).json({
      error: {
        message:
          "Your subscription or trial period has expired. Please subscribe to restore write access.",
        code: "SUBSCRIPTION_EXPIRED",
        status: 402,
      },
    });
  } catch (error) {
    console.error("Subscription middleware error:", error);

    return res.status(500).json({
      error: {
        message: "Unable to verify subscription access.",
        code: "SUBSCRIPTION_VERIFICATION_FAILED",
        status: 500,
      },
    });
  }
}


// Middleware to block non-superadmins during system maintenance mode
async function checkMaintenanceMode(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  try {
    const isMaint = await SuperService.isMaintenanceModeActive();
    if (!isMaint) {
      return next();
    }

    const user = req.user;
    if (user && user.is_super_admin) {
      return next();
    }

    res.status(503).json({
      error: {
        message: "Collabix platform is currently in maintenance mode. Please try again shortly.",
        code: "MAINTENANCE_MODE",
        status: 503,
      },
    });
  } catch {
    next();
  }
}

// Mount API routes (protected with auth, maintenance mode check, subscription limits, and CSRF validation)
app.use("/api", authenticateUser, checkMaintenanceMode, checkSubscription, validateCSRF, apiRouter);

// Global Error Handler
app.use(errorHandler);

export default app;
export { app };