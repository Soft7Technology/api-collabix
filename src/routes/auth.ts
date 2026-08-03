import { Router } from "express";
import { AuthController } from "../controllers/authController.js";
import { authenticateUser } from "../middleware/authenticate.js";
import { rateLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// Rate limiters: 10 attempts per 15 minutes for auth endpoints, 30 for token refresh
const authLimiter = rateLimiter(15 * 60 * 1000, 10);
const refreshLimiter = rateLimiter(15 * 60 * 1000, 30);

// Login
router.post("/login", authLimiter, AuthController.login);

// Register
router.post("/register", authLimiter, AuthController.register);

// Refresh Token
router.post("/refresh", refreshLimiter, AuthController.refresh);

// Setup Password & Activate User
router.post("/setup-password", authLimiter, AuthController.setupPassword);

// Verify Invite Token
router.get("/verify-invite", AuthController.verifyInvite);

// Logout
router.post("/logout", AuthController.logout);

// Current User Session (authenticated)
router.get("/me", authenticateUser, AuthController.me);

// Organization Subscription Upgrade/Renewal
router.post("/subscription", authenticateUser, AuthController.updateSubscription);

// Password Reset Flow
router.post("/forgot-password", authLimiter, AuthController.forgotPassword);
router.get("/verify-reset-token", AuthController.verifyResetToken);
router.post("/reset-password", authLimiter, AuthController.resetPassword);

export { router };
export default router;
