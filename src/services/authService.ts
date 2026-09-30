import crypto from "crypto";
import "dotenv/config"
import { pool, db } from "../db/index.js";
import {
  comparePassword,
  hashPassword,
  // generateAccessToken,
  // generateRefreshToken,
} from "../utils/auth.js";
import { config } from "../config/index.js";
import { emailService } from "./emailService.js";
import { RazorpayService } from "./razorpayService.js";

const razorpayKeyId = process.env.RAZORPAY_KEY_ID;

if (!razorpayKeyId) {
  throw new Error("RAZORPAY_KEY_ID is not configured.");
}

/**
 * SHA-256 hash helper for secure tokens (invitations & refresh tokens).
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  /**
   * Log in user with email and password.
   */
  static async login(email: string, password?: string) {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }

    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.role_id, u.status, u.is_super_admin, u.organization_id, u.department_id, u.can_create_tasks,
              r.name as role_name, r.rank as role_rank,
              d.name as department_name,
              o.name as org_name, o.subscription_status, o.trial_ends_at, o.is_approved as org_is_approved, o.timezone as org_timezone, o.created_at as org_created_at 
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN organizations o ON u.organization_id = o.id
       WHERE u.email = $1;`,
      [email.toLowerCase().trim()],
    );
    const user = rows[0];

    if (!user) {
      throw new Error("Invalid email or password.");
    }

    if (user.status !== "ACTIVE") {
      throw new Error("User account is inactive or pending invitation.");
    }

    if (!user.password_hash) {
      throw new Error(
        "Password has not been configured. Please verify your invitation.",
      );
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      throw new Error("Invalid email or password.");
    }

    // Fetch user permissions
    const permResult = await db.query(
      "SELECT permission_name FROM role_permissions WHERE role_id = $1;",
      [user.role_id],
    );
    const permissions = permResult.rows.map((r) => r.permission_name);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.role_id,
      roleName: user.role_name,
      roleRank: user.role_rank,
      canCreateTasks: !!user.can_create_tasks,
      departmentId: user.department_id,
      departmentName: user.department_name,
      isSuperAdmin: user.is_super_admin,
      organizationId: user.organization_id,
      organization: user.organization_id
        ? {
            id: user.organization_id,
            name: user.org_name,
            timezone: user.org_timezone,
            subscriptionStatus: user.subscription_status,
            trialEndsAt: user.trial_ends_at,
            isApproved: user.org_is_approved,
            createdAt: user.org_created_at,
          }
        : null,
      permissions,
    };
  }

  /**
   * Verify an invitation token without updating the database (read-only).
   */
  static async verifyInviteToken(rawToken: string) {
    if (!rawToken) {
      throw new Error("Invitation token is required.");
    }

    const hexMatch = rawToken.match(/[0-9a-fA-F]{64}/);
    const cleanToken = hexMatch ? hexMatch[0] : rawToken.trim().slice(0, 64);
    const tokenHash = hashToken(cleanToken);
    const { rows } = await db.query(
      `SELECT ui.expires_at, ui.is_used, u.email, u.name 
       FROM user_invitations ui 
       JOIN users u ON ui.user_id = u.id 
       WHERE ui.token_hash = $1;`,
      [tokenHash],
    );
    const invite = rows[0];

    if (!invite) {
      throw new Error("Invalid invitation token.");
    }

    if (invite.is_used) {
      throw new Error("Invitation token has already been used.");
    }

    if (new Date(invite.expires_at) < new Date()) {
      throw new Error("Invitation token has expired.");
    }

    return {
      email: invite.email,
      name: invite.name,
    };
  }

  /**
   * Setup password and activate user inside a SQL transaction.
   */
  static async setupPassword(rawToken: string, password?: string) {
    if (!rawToken || !password) {
      throw new Error("Token and password are required.");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters long.");
    }

    const hexMatch = rawToken.match(/[0-9a-fA-F]{64}/);
    const cleanToken = hexMatch ? hexMatch[0] : rawToken.trim().slice(0, 64);
    const tokenHash = hashToken(cleanToken);
    const client = await pool.connect();

    try {
      await client.query("BEGIN;");

      // 1. Fetch and lock invitation row
      const inviteResult = await client.query(
        `SELECT id, user_id, expires_at, is_used 
         FROM user_invitations 
         WHERE token_hash = $1 FOR UPDATE;`,
        [tokenHash],
      );
      const invite = inviteResult.rows[0];

      if (!invite) {
        throw new Error("Invalid invitation token.");
      }

      if (invite.is_used) {
        throw new Error("Invitation token has already been used.");
      }

      if (new Date(invite.expires_at) < new Date()) {
        throw new Error("Invitation token has expired.");
      }

      // 2. Hash new password
      const hashedPassword = await hashPassword(password);

      // 3. Update user status and password
      await client.query(
        `UPDATE users 
         SET password_hash = $1, status = 'ACTIVE', updated_at = NOW() 
         WHERE id = $2;`,
        [hashedPassword, invite.user_id],
      );

      const userDetails = await client.query(
        `SELECT u.id, u.name, u.email, u.role_id, u.is_super_admin, u.organization_id, u.department_id,
                r.name as role_name, r.rank as role_rank,
                d.name as department_name,
                o.name as org_name, o.subscription_status, o.trial_ends_at, o.is_approved as org_is_approved, o.timezone as org_timezone, o.created_at as org_created_at
         FROM users u
         JOIN roles r ON u.role_id = r.id
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN organizations o ON u.organization_id = o.id
         WHERE u.id = $1;`,
        [invite.user_id],
      );
      const user = userDetails.rows[0];

      if (!user) {
        throw new Error("User associated with this invitation does not exist.");
      }

      // 4. Mark invitation as used
      await client.query(
        "UPDATE user_invitations SET is_used = TRUE WHERE id = $1;",
        [invite.id],
      );

      // 5. Fetch role permissions
      const permResult = await client.query(
        "SELECT permission_name FROM role_permissions WHERE role_id = $1;",
        [user.role_id],
      );
      const permissions = permResult.rows.map((r: any) => r.permission_name);

      await client.query("COMMIT;");

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.role_id,
        roleName: user.role_name,
        roleRank: user.role_rank,
        departmentId: user.department_id,
        departmentName: user.department_name,
        isSuperAdmin: user.is_super_admin,
        organizationId: user.organization_id,
        organization: user.organization_id
          ? {
              id: user.organization_id,
              name: user.org_name,
              timezone: user.org_timezone,
              subscriptionStatus: user.subscription_status,
              trialEndsAt: user.trial_ends_at,
              isApproved: user.org_is_approved,
              createdAt: user.org_created_at,
            }
          : null,
        permissions,
      };
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Refreshes user session by validating and rotating the refresh token.
   */
  static async refreshSession(rawRefreshToken: string) {
    if (!rawRefreshToken) {
      throw new Error("Refresh token is required.");
    }

    const tokenHash = hashToken(rawRefreshToken);
    const client = await pool.connect();

    try {
      await client.query("BEGIN;");

      // Fetch and lock refresh token record
      const tokenResult = await client.query(
        `SELECT id, user_id, expires_at, revoked_at 
         FROM refresh_tokens 
         WHERE token_hash = $1 FOR UPDATE;`,
        [tokenHash],
      );
      const rt = tokenResult.rows[0];

      if (!rt) {
        throw new Error("Invalid refresh token.");
      }

      if (rt.revoked_at) {
        throw new Error("Refresh token has been revoked.");
      }

      if (new Date(rt.expires_at) < new Date()) {
        throw new Error("Refresh token has expired.");
      }

      // Fetch user profile, joining with roles and organizations
      const userResult = await client.query(
        `SELECT u.id, u.name, u.email, u.role_id, u.status, u.is_super_admin, u.organization_id, u.department_id,
                r.name as role_name, r.rank as role_rank,
                d.name as department_name,
                o.name as org_name, o.subscription_status, o.trial_ends_at, o.is_approved as org_is_approved, o.timezone as org_timezone, o.created_at as org_created_at
         FROM users u
         JOIN roles r ON u.role_id = r.id
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN organizations o ON u.organization_id = o.id
         WHERE u.id = $1;`,
        [rt.user_id],
      );
      const user = userResult.rows[0];

      if (!user || user.status !== "ACTIVE") {
        throw new Error("User account is inactive or deleted.");
      }

      // Fetch role permissions
      const permResult = await client.query(
        "SELECT permission_name FROM role_permissions WHERE role_id = $1;",
        [user.role_id],
      );
      const permissions = permResult.rows.map((r: any) => r.permission_name);

      // Rotate Refresh Token: Revoke current
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1;",
        [rt.id],
      );

      // Generate new refresh token
      const newRawRt = crypto.randomBytes(40).toString("hex");
      const newRtHash = hashToken(newRawRt);
      // Expiration time is 30 days from now
      const newRtExpires = new Date();
      newRtExpires.setDate(newRtExpires.getDate() + 30);

      await client.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
         VALUES ($1, $2, $3);`,
        [user.id, newRtHash, newRtExpires],
      );

      await client.query("COMMIT;");

      const userPayload = {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.role_id,
        roleName: user.role_name,
        roleRank: user.role_rank,
        departmentId: user.department_id,
        departmentName: user.department_name,
        isSuperAdmin: user.is_super_admin,
        organizationId: user.organization_id,
        organization: user.organization_id
          ? {
              id: user.organization_id,
              name: user.org_name,
              timezone: user.org_timezone,
              subscriptionStatus: user.subscription_status,
              trialEndsAt: user.trial_ends_at,
              isApproved: user.org_is_approved,
              createdAt: user.org_created_at,
            }
          : null,
        permissions,
      };

      return {
        user: userPayload,
        newRawRefreshToken: newRawRt,
      };
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Revoke a refresh token on logout.
   */
  static async revokeRefreshToken(rawRefreshToken: string) {
    if (!rawRefreshToken) return;

    const tokenHash = hashToken(rawRefreshToken);
    await db.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL;",
      [tokenHash],
    );
  }

  /**
   * Register a new organization and its company admin.
   */
  static async register(params: {
    companyName: string;
    fullName: string;
    email: string;
    phone: string;
    password?: string;
  }) {
    const { companyName, fullName, email, phone, password } = params;

    if (!companyName || !fullName || !email || !password) {
      throw new Error(
        "All fields (Company Name, Full Name, Email, Password) are required.",
      );
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters long.");
    }

    const emailLower = email.toLowerCase().trim();
    const companyTrimmed = companyName.trim();

    // Check if user exists
    const userCheck = await db.query("SELECT id FROM users WHERE email = $1;", [
      emailLower,
    ]);
    if (userCheck.rows[0]) {
      throw new Error("A user with this email address is already registered.");
    }

    // Check if organization name is already taken
    const orgCheck = await db.query(
      "SELECT id FROM organizations WHERE LOWER(name) = LOWER($1);",
      [companyTrimmed],
    );
    if (orgCheck.rows[0]) {
      throw new Error(
        "An organization with this company name is already registered.",
      );
    }

    // Resolve Admin role ID
    const roleRes = await db.query(
      "SELECT id FROM roles WHERE name = 'Admin';",
    );
    const adminRoleId = roleRes.rows[0]?.id;
    if (!adminRoleId) {
      throw new Error("System Admin role is missing. Please contact support.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Create Organization (5-day free trial, full feature access)
      const trialDays = process.env.TRIAL_DURATION_DAYS || "5";
      const orgResult = await client.query(
        `INSERT INTO organizations (name, phone, subscription_status, trial_ends_at, is_approved)
         VALUES ($1, $2, 'TRIALING', NOW() + CAST($3 || ' days' AS INTERVAL), TRUE)
         RETURNING id, name, subscription_status, trial_ends_at, is_approved, created_at;`,
        [companyTrimmed, phone.trim(), trialDays],
      );
      const organization = orgResult.rows[0];

      // 2. Hash Password
      const passwordHash = await hashPassword(password);

      // 3. Generate initials and avatar color
      const colors = [
        "var(--terracotta)",
        "var(--mustard)",
        "var(--sage)",
        "var(--plum)",
        "var(--ink)",
        "#3b82f6",
      ];
      const avatarColor = colors[Math.floor(Math.random() * colors.length)];
      const initials = fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

      const userId = `u${Date.now()}`;

      // 4. Create Admin User
      const userResult = await client.query(
        `INSERT INTO users (id, name, role, email, avatar_color, initials, password_hash, role_id, status, is_super_admin, organization_id)
         VALUES ($1, $2, 'Admin', $3, $4, $5, $6, $7, 'ACTIVE', FALSE, $8)
         RETURNING id, name, email, role, role_id, status, is_super_admin;`,
        [
          userId,
          fullName.trim(),
          emailLower,
          avatarColor,
          initials,
          passwordHash,
          adminRoleId,
          organization.id,
        ],
      );
      const user = userResult.rows[0];

      await client.query("COMMIT;");

      return {
        user,
        organization,
      };
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Request a password reset.
   */
  static async requestPasswordReset(email: string): Promise<void> {
    if (!email) {
      throw new Error("Email is required.");
    }

    const emailLower = email.toLowerCase().trim();

    // Check if the user exists
    const userRes = await pool.query("SELECT id FROM users WHERE email = $1;", [
      emailLower,
    ]);
    const user = userRes.rows[0];

    // If user does not exist, return silently to prevent email enumeration
    if (!user) {
      console.log(
        `🔍 Password reset requested for unregistered email: ${emailLower}. Ignoring silently.`,
      );
      return;
    }

    // Generate secure random token
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save token hash to database
    await pool.query(
      `INSERT INTO password_resets (email, token_hash, expires_at)
       VALUES ($1, $2, $3);`,
      [emailLower, tokenHash, expiresAt],
    );

    // Send email
    const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(emailLower)}`;
    await emailService.sendPasswordResetEmail(emailLower, resetUrl);
  }

  /**
   * Verify password reset token.
   */
  static async verifyResetToken(
    email: string,
    token: string,
  ): Promise<boolean> {
    if (!email || !token) {
      return false;
    }

    const emailLower = email.toLowerCase().trim();
    const tokenHash = hashToken(token.trim());

    const resetRes = await pool.query(
      `SELECT id FROM password_resets
       WHERE email = $1 AND token_hash = $2 AND is_used = FALSE AND expires_at > NOW();`,
      [emailLower, tokenHash],
    );

    return resetRes.rows.length > 0;
  }

  /**
   * Reset user password using token.
   */
  static async resetPassword(
    email: string,
    token: string,
    newPassword?: string,
  ): Promise<void> {
    if (!email || !token || !newPassword) {
      throw new Error("Email, token, and new password are required.");
    }

    if (newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters long.");
    }

    const emailLower = email.toLowerCase().trim();
    const tokenHash = hashToken(token.trim());

    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      // Verify token
      const resetRes = await client.query(
        `SELECT id FROM password_resets
         WHERE email = $1 AND token_hash = $2 AND is_used = FALSE AND expires_at > NOW()
         FOR UPDATE;`,
        [emailLower, tokenHash],
      );

      if (resetRes.rows.length === 0) {
        throw new Error("Invalid or expired password reset token.");
      }

      // Hash password
      const hashedPassword = await hashPassword(newPassword);

      // Update password
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2;`,
        [hashedPassword, emailLower],
      );

      // Mark token as used
      await client.query(
        `UPDATE password_resets SET is_used = TRUE WHERE email = $1 AND token_hash = $2;`,
        [emailLower, tokenHash],
      );

      await client.query("COMMIT;");
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update organization subscription status and plan.
   */ 
  static async updateSubscription(params: {
  userId: string;
  organizationId: string;
  planId: string;
  billingCycle?: string;
}) {
  const {
    userId,
    organizationId,
    planId,
    billingCycle = "monthly",
  } = params;

  if (!organizationId) {
    throw new Error("User organization not found.");
  }

  if (!["monthly", "yearly"].includes(billingCycle)) {
    throw new Error("Invalid billing cycle.");
  }

  const planRes = await pool.query(
    `SELECT
       id,
       name,
       price_monthly,
       price_yearly,
       razorpay_monthly_plan_id,
       razorpay_yearly_plan_id
     FROM plans
     WHERE id = $1
       AND is_active = TRUE`,
    [planId]
  );

  const plan = planRes.rows[0];

  if (!plan) {
    throw new Error("Selected plan not found or inactive.");
  }

  const razorpayPlanId =
    billingCycle === "monthly"
      ? plan.razorpay_monthly_plan_id
      : plan.razorpay_yearly_plan_id;

  if (!razorpayPlanId) {
    throw new Error(
      `Razorpay plan is not configured for ${planId} ${billingCycle}.`
    );
  }

  const price =
    billingCycle === "monthly"
      ? plan.price_monthly
      : plan.price_yearly;

      console.log("price",price)

  // Checking weather organization has a pending/active subscription
  const existingRes = await pool.query(
    `SELECT
       id,
       plan_id,
       billing_cycle,
       status,
       razorpay_subscription_id
     FROM subscriptions
     WHERE organization_id = $1
       AND status IN ('pending', 'active')
     ORDER BY created_at DESC
     LIMIT 1`,
    [organizationId]
  );

  const existingSubscription = existingRes.rows[0];

  
  // Reuse an old pending database record if one exists, otherwise creating new
  let databaseSubscriptionId: string;
  
  const samePlanAndCycle =
  existingSubscription?.plan_id === planId &&
  existingSubscription?.billing_cycle === billingCycle;

  if(!existingSubscription){
      
      const subscriptionRes = await pool.query(
      `INSERT INTO subscriptions (
         organization_id,
         plan_id,
         billing_cycle,
         status
       )
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [organizationId, planId, billingCycle]
    );

    databaseSubscriptionId = subscriptionRes.rows[0].id;
      
  } 
  
  else if (existingSubscription?.status === "active") {
    throw new Error(
      "Your organization already has an active subscription."
    );
  }


 else if (
    existingSubscription.status === "pending" &&
    !existingSubscription.razorpay_subscription_id
  ) {
    databaseSubscriptionId = existingSubscription.id;

    await pool.query(
      `UPDATE subscriptions
       SET plan_id = $1,
           billing_cycle = $2,
           status = 'pending',
           updated_at = NOW()
       WHERE id = $3`,
      [planId, billingCycle, databaseSubscriptionId]
    );
  }
  
  else if (  
            existingSubscription?.status === "pending" &&
            existingSubscription?.razorpay_subscription_id && 
            samePlanAndCycle
    ) {
  return {
    message: "Existing Razorpay subscription found. Continue payment.",
    subscription: {
      id: existingSubscription.id,
      planId,
      billingCycle,
      status: existingSubscription.status,
      razorpaySubscriptionId:
        existingSubscription.razorpay_subscription_id,
      razorpayKeyId,
    },
  };
} 

else {
  await pool.query(
  `UPDATE subscriptions
   SET status = 'cancelled',
       cancelled_at = NOW(),
       updated_at = NOW()
   WHERE id = $1
     AND status = 'pending'`,
  [existingSubscription.id]
);
    const subscriptionRes = await pool.query(
      `INSERT INTO subscriptions (
         organization_id,
         plan_id,
         billing_cycle,
         status
       )
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [organizationId, planId, billingCycle]
    );

    databaseSubscriptionId = subscriptionRes.rows[0].id;
  }

  try {
    // Create the REAL Razorpay subscription
    const totalCount =
      billingCycle === "monthly"
        ? 1200
        : 100;

    const razorpaySubscription =
      await RazorpayService.createRazorpaySubscription({
        planId: razorpayPlanId,
        totalCount,
        notes: {
          organization_id: organizationId,
          db_subscription_id: databaseSubscriptionId,
          plan_id: planId,
          billing_cycle: billingCycle,
        },
      });

    // 7. Store Razorpay's subscription ID in db
    const updatedRes = await pool.query(
      `UPDATE subscriptions
       SET razorpay_subscription_id = $1,
           status = 'pending',
           updated_at = NOW()
       WHERE id = $2
       RETURNING
         id,
         organization_id,
         plan_id,
         billing_cycle,
         status,
         razorpay_subscription_id`,
      [
        razorpaySubscription.id,
        databaseSubscriptionId,
      ]
    );

    const subscription = updatedRes.rows[0];

    return {
      message: "Razorpay subscription created. Payment authorization required.",

      subscription: {
        id: subscription.id,
        organizationId: subscription.organization_id,
        planId: subscription.plan_id,
        planName: plan.name,
        billingCycle: subscription.billing_cycle,
        amount: price,
        status: subscription.status,

        razorpaySubscriptionId:
          subscription.razorpay_subscription_id,

          //Razorpay key id for Razorpay checkout
        razorpayKeyId,
      },
    };
  } catch (error) {
    await pool.query(
      `UPDATE subscriptions
       SET status = 'failed',
           updated_at = NOW()
       WHERE id = $1`,
      [databaseSubscriptionId]
    );

    throw error;
  }
}

// Verification by razorpay for payment done
static async verifySubscriptionPayment(params: {
  organizationId: string;
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  razorpaySignature: string;
}) {
  const {
    organizationId,
    razorpayPaymentId,
    razorpaySubscriptionId,
    razorpaySignature,
  } = params;

  const subscriptionRes = await pool.query(
    `SELECT
       id,
       organization_id,
       plan_id,
       billing_cycle,
       status,
       razorpay_subscription_id
     FROM subscriptions
     WHERE organization_id = $1
       AND razorpay_subscription_id = $2
     LIMIT 1`,
    [organizationId, razorpaySubscriptionId]
  );

  const subscription = subscriptionRes.rows[0];

  if (!subscription) {
    throw new Error(
      "Subscription not found for this organization."
    );
  }

  // Verification for payment
  const isValid =
   await RazorpayService.verifyRazorpaySubscriptionPayment({
      paymentId: razorpayPaymentId,
      subscriptionId: razorpaySubscriptionId,
      signature: razorpaySignature,
    });

  if (!isValid) {
    throw new Error("Invalid Razorpay payment signature.");
  }

  const razorpaySubscription =
  await RazorpayService.getRazorpaySubscription(
    razorpaySubscriptionId,
  );

  const currentPeriodStart =
  razorpaySubscription.current_start
    ? new Date(
        razorpaySubscription.current_start * 1000,
      )
    : null;

const currentPeriodEnd =
  razorpaySubscription.current_end
    ? new Date(
        razorpaySubscription.current_end * 1000,
      )
    : null;

 const updatedSubscriptionRes = await pool.query(
  `UPDATE subscriptions
   SET status = 'active',
       razorpay_customer_id = $1,
       started_at = COALESCE(
         started_at,
         NOW()
       ),
       current_period_start = $2,
       current_period_end = $3,
       updated_at = NOW()
   WHERE id = $4
   RETURNING
     id,
     organization_id,
     plan_id,
     billing_cycle,
     status,
     razorpay_subscription_id,
     started_at,
     current_period_start,
     current_period_end`,
  [
    razorpaySubscription.customer_id ?? null,
    currentPeriodStart,
    currentPeriodEnd,
    subscription.id,
  ],
);

  const updatedSubscription =
    updatedSubscriptionRes.rows[0];

  await pool.query(
    `UPDATE organizations
     SET subscription_status = 'ACTIVE',
         updated_at = NOW()
     WHERE id = $1`,
    [organizationId]
  );

  return {
    message: "Payment verified successfully.",
    subscription: {
      id: updatedSubscription.id,
      organizationId:
        updatedSubscription.organization_id,
      planId: updatedSubscription.plan_id,
      billingCycle:
        updatedSubscription.billing_cycle,
      status: updatedSubscription.status,
      razorpaySubscriptionId:
        updatedSubscription.razorpay_subscription_id,
      startedAt: updatedSubscription.started_at,
      currentPeriodStart:
        updatedSubscription.current_period_start,
    },
  };
}


// Razorpay webhook to align razropay subscription status with our DB subscription status
static async handleRazorpayWebhook(payload: any) {
  const event = payload?.event;
  const subscription =
    payload?.payload?.subscription?.entity;

  if (!event || !subscription) {
    throw new Error("Invalid Razorpay webhook payload.");
  }

  switch (event) {
    case "subscription.authenticated":
      await pool.query(
        `UPDATE subscriptions
         SET status = 'pending',
             razorpay_customer_id = $1,
             updated_at = NOW()
         WHERE razorpay_subscription_id = $2`,
        [
          subscription.customer_id,
          subscription.id,
        ]
      );
      break;

    case "subscription.activated": {
    const result =  await pool.query(
        `UPDATE subscriptions
         SET status = 'active',
             razorpay_customer_id = $1,
             current_period_start = $2,
             current_period_end = $3,
             started_at = COALESCE(started_at, NOW()),
             updated_at = NOW()
         WHERE razorpay_subscription_id = $4
         RETURNING organization_id`,
        [
          subscription.customer_id ?? null,
          subscription.current_start
            ? new Date(subscription.current_start * 1000)
            : null,
          subscription.current_end
            ? new Date(subscription.current_end * 1000)
            : null,
          subscription.id,
        ]
      );

      const organizationId =
        result.rows[0]?.organization_id;

      if (organizationId) {
        await pool.query(
          `UPDATE organizations
           SET subscription_status = 'ACTIVE',
               updated_at = NOW()
           WHERE id = $1`,
          [organizationId]
        );
      }

      break;
    }

    case "subscription.charged":
      await pool.query(
        `UPDATE subscriptions
         SET status = 'active',
             current_period_start = $1,
             current_period_end = $2,
             updated_at = NOW()
         WHERE razorpay_subscription_id = $3`,
        [
          subscription.current_start
            ? new Date(subscription.current_start * 1000)
            : null,
          subscription.current_end
            ? new Date(subscription.current_end * 1000)
            : null,
          subscription.id,
        ]
      );
      break;

    case "subscription.pending":
      await pool.query(
        `UPDATE subscriptions
         SET status = 'pending',
             updated_at = NOW()
         WHERE razorpay_subscription_id = $1`,
        [subscription.id]
      );
      break;

    case "subscription.halted":
      await pool.query(
        `UPDATE subscriptions
         SET status = 'paused',
             updated_at = NOW()
         WHERE razorpay_subscription_id = $1`,
        [subscription.id]
      );
      break;

   case "subscription.cancelled": {
   await pool.query(
    `UPDATE subscriptions
     SET status = 'cancelled',
         cancel_at_period_end = FALSE,
         cancelled_at = COALESCE(cancelled_at, NOW()),
         updated_at = NOW()
     WHERE razorpay_subscription_id = $1
     RETURNING organization_id`,
    [subscription.id],
  );

  break;
   }

    case "subscription.completed": {
  await pool.query(
    `UPDATE subscriptions
     SET status = 'expired',
         updated_at = NOW()
     WHERE razorpay_subscription_id = $1`,
    [subscription.id]
  );

  await pool.query(
    `UPDATE organizations
     SET subscription_status = 'EXPIRED',
         trial_ends_at = NULL,
         updated_at = NOW()
     WHERE id = (
       SELECT organization_id
       FROM subscriptions
       WHERE razorpay_subscription_id = $1
     )`,
    [subscription.id]
  );

  break;
}

    default:
      console.log(`Unhandled Razorpay event: ${event}`);
  }
}

// Cancelling organization subscription
static async cancelSubscription(params: {
  organizationId: string;
}) {
  const { organizationId } = params;

  const subscriptionRes = await pool.query(
    `SELECT
       id,
       plan_id,
       billing_cycle,
       status,
       razorpay_subscription_id,
       current_period_start,
       current_period_end,
       cancel_at_period_end
     FROM subscriptions
     WHERE organization_id = $1
       AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [organizationId],
  );

  const subscription = subscriptionRes.rows[0];

  if (!subscription) {
    throw new Error("No active subscription found.");
  }

  if (subscription.cancel_at_period_end) {
    throw new Error(
      "This subscription is already scheduled for cancellation.",
    );
  }

  if (!subscription.razorpay_subscription_id) {
    throw new Error(
      "Razorpay subscription ID is missing.",
    );
  }

  await RazorpayService.cancelRazorpaySubscription(
    subscription.razorpay_subscription_id,
    true,
  );

  const updatedRes = await pool.query(
    `UPDATE subscriptions
     SET cancel_at_period_end = TRUE,
         updated_at = NOW()
     WHERE id = $1
     RETURNING
       id,
       plan_id,
       billing_cycle,
       status,
       razorpay_subscription_id,
       current_period_start,
       current_period_end,
       cancel_at_period_end`,
    [subscription.id],
  );

  const updatedSubscription = updatedRes.rows[0];

  return {
    message:
      "Subscription cancellation scheduled for the end of the current billing period.",
    subscription: {
      id: updatedSubscription.id,
      planId: updatedSubscription.plan_id,
      billingCycle: updatedSubscription.billing_cycle,
      status: updatedSubscription.status,
      razorpaySubscriptionId:
        updatedSubscription.razorpay_subscription_id,
      currentPeriodStart:
        updatedSubscription.current_period_start,
      currentPeriodEnd:
        updatedSubscription.current_period_end,
      cancelAtPeriodEnd:
        updatedSubscription.cancel_at_period_end,
    },
  };
}

static async getOrganizationSubscription(params:{
  organizationId: string;
}) {

  const { organizationId } = params;

   const res = await db.query(
    `SELECT
       id,
       plan_id,
       billing_cycle,
       status,
       current_period_start,
       current_period_end,
       cancel_at_period_end
     FROM subscriptions
     WHERE organization_id = $1
       AND status = 'active'
     LIMIT 1`,
    [organizationId],
  );

  const organizationSubscription =  res.rows[0] ?? null;

  return {
  subscription: organizationSubscription
    ? {
        id: organizationSubscription.id,
        planName: organizationSubscription.plan_id,
        billingCycle: organizationSubscription.billing_cycle,
        status: organizationSubscription.status,
        currentPeriodStart:
          organizationSubscription.current_period_start,
        currentPeriodEnd:
          organizationSubscription.current_period_end,
        startedAt: organizationSubscription.started_at,
        cancelledAt: organizationSubscription.cancelled_at,
        cancelAtPeriodEnd:
          organizationSubscription.cancel_at_period_end,
      }
    : null,
};
}
}

