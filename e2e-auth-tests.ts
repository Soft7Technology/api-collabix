import crypto from "crypto";
import { pool } from "./src/db/index.js";

const BASE_URL = "http://localhost:5000";

const TEST_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const TEST_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

if (!TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD) {
  throw new Error(
    "SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD environment variables are required to run tests.",
  );
}

// Helper for SHA-256 token hashing
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Simple Cookie Jar to manage cookies across E2E test requests
class CookieJar {
  cookies: Record<string, string> = {};

  update(headers: Headers) {
    // Node.js Headers.getSetCookie returns an array of Set-Cookie header strings
    const setCookies = (headers as any).getSetCookie
      ? (headers as any).getSetCookie()
      : [];
    for (const cookieStr of setCookies) {
      const parts = cookieStr.split(";");
      const firstPart = parts[0];
      if (firstPart && firstPart.includes("=")) {
        const eqIdx = firstPart.indexOf("=");
        const name = firstPart.slice(0, eqIdx).trim();
        const val = firstPart.slice(eqIdx + 1).trim();

        // Check if cookie is being cleared/expired
        const isExpired = parts.some(
          (p: string) =>
            p.toLowerCase().includes("max-age=0") ||
            p.toLowerCase().includes("expires=thu, 01 jan 1970"),
        );

        if (val === "" || isExpired) {
          delete this.cookies[name];
        } else {
          this.cookies[name] = val;
        }
      }
    }
  }

  getCookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([name, val]) => `${name}=${val}`)
      .join("; ");
  }

  clear() {
    this.cookies = {};
  }
}

async function runTests() {
  console.log("🚀 Starting E2E Authentication and RBAC Tests...");
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: any, message: string) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  async function testGroup(name: string, fn: () => Promise<void>) {
    try {
      console.log(`\n📋 Running: ${name}`);
      await fn();
      console.log(`✅ PASS: ${name}`);
      passedCount++;
    } catch (error: any) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Reason: ${error.message || error}`);
      failedCount++;
    }
  }

  const adminJar = new CookieJar();
  const memberJar = new CookieJar();
  let memberRoleId = "";
  let engineeringDeptId = "";

  // Helper to fetch role/department IDs
  try {
    const roleRes = await pool.query(
      "SELECT id FROM roles WHERE name = 'Teammates';",
    );
    memberRoleId = roleRes.rows[0]?.id;
    const deptRes = await pool.query(
      "SELECT id FROM departments WHERE name = 'Engineering';",
    );
    engineeringDeptId = deptRes.rows[0]?.id;
  } catch (err: any) {
    console.error(
      "❌ Failed to query database for test parameters:",
      err.message,
    );
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Invite → Setup Password → Login (Happy Path)
  // ---------------------------------------------------------------------------
  await testGroup("Invite → Setup Password → Login", async () => {
    // 1. Admin logs in
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD,
      }),
    });
    assert(
      loginRes.status === 200,
      `Admin login status should be 200, got ${loginRes.status}`,
    );
    adminJar.update(loginRes.headers);

    const csrfToken = adminJar.cookies["csrf_token"];
    assert(csrfToken, "CSRF token cookie should be set after admin login");

    // 2. Admin invites member
    const inviteRes = await fetch(`${BASE_URL}/api/team/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminJar.getCookieHeader(),
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        name: "Jane Member",
        email: "jane@studio.co",
        roleId: memberRoleId,
        departmentId: engineeringDeptId,
      }),
    });
    assert(
      inviteRes.status === 201,
      `Invite status should be 201, got ${inviteRes.status}`,
    );

    // 3. Inject known raw token in DB
    const rawToken = "janeRawToken1234567890abcdefghijkl";
    const tokenHash = hashToken(rawToken);
    await pool.query(
      `UPDATE user_invitations 
       SET token_hash = $1 
       WHERE user_id = (SELECT id FROM users WHERE email = 'jane@studio.co');`,
      [tokenHash],
    );

    // 4. Verify invitation
    const verifyRes = await fetch(
      `${BASE_URL}/auth/verify-invite?token=${rawToken}`,
    );
    assert(
      verifyRes.status === 200,
      `Verify invite status should be 200, got ${verifyRes.status}`,
    );
    const verifyData = await verifyRes.json();
    assert(
      verifyData.email === "jane@studio.co",
      `Expected email jane@studio.co, got ${verifyData.email}`,
    );

    // 5. Setup password
    const setupRes = await fetch(`${BASE_URL}/auth/setup-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, password: "password123" }),
    });
    assert(
      setupRes.status === 200,
      `Setup password status should be 200, got ${setupRes.status}`,
    );
    memberJar.update(setupRes.headers);

    assert(
      memberJar.cookies["access_token"],
      "Access token cookie should be set for Member",
    );
    assert(
      memberJar.cookies["refresh_token"],
      "Refresh token cookie should be set for Member",
    );

    // 6. Logout Member
    const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: memberJar.getCookieHeader(),
      },
    });
    assert(
      logoutRes.status === 200,
      `Logout status should be 200, got ${logoutRes.status}`,
    );
    memberJar.update(logoutRes.headers);
    assert(
      !memberJar.cookies["access_token"],
      "Access token should be cleared after logout",
    );

    // 7. Login as Member
    const memberLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "jane@studio.co",
        password: "password123",
      }),
    });
    assert(
      memberLoginRes.status === 200,
      `Member login status should be 200, got ${memberLoginRes.status}`,
    );
    memberJar.clear();
    memberJar.update(memberLoginRes.headers);
    assert(
      memberJar.cookies["access_token"],
      "Access token should be set after member login",
    );
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Login → Refresh Token → Logout
  // ---------------------------------------------------------------------------
  await testGroup("Login → Refresh Token → Logout", async () => {
    const jar = new CookieJar();

    // 1. Login
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD,
      }),
    });
    jar.update(loginRes.headers);
    const originalRefreshToken = jar.cookies["refresh_token"];
    assert(originalRefreshToken, "Refresh token should be set on login");

    // 2. Refresh session
    const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        Cookie: jar.getCookieHeader(),
      },
    });
    assert(
      refreshRes.status === 200,
      `Refresh status should be 200, got ${refreshRes.status}`,
    );
    jar.update(refreshRes.headers);
    const rotatedRefreshToken = jar.cookies["refresh_token"];
    assert(
      rotatedRefreshToken,
      "New refresh token should be set after refresh",
    );
    assert(
      rotatedRefreshToken !== originalRefreshToken,
      "Refresh token must be rotated",
    );

    // 3. Replay attack protection: Try using the old refresh token again
    const oldCookieHeader = `refresh_token=${originalRefreshToken}`;
    const replayRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        Cookie: oldCookieHeader,
      },
    });
    assert(
      replayRes.status === 401,
      `Expected 401 on replay refresh, got ${replayRes.status}`,
    );

    // 4. Logout using new session cookies
    const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: jar.getCookieHeader(),
      },
    });
    assert(
      logoutRes.status === 200,
      `Logout status should be 200, got ${logoutRes.status}`,
    );
    jar.update(logoutRes.headers);

    // 5. Verify /auth/me returns 401
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        Cookie: jar.getCookieHeader(),
      },
    });
    assert(
      meRes.status === 401,
      `me endpoint should return 401 after logout, got ${meRes.status}`,
    );
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Expired Invitation
  // ---------------------------------------------------------------------------
  await testGroup("Expired Invitation", async () => {
    // 1. Admin invites user
    const inviteRes = await fetch(`${BASE_URL}/api/team/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminJar.getCookieHeader(),
        "X-CSRF-Token": adminJar.cookies["csrf_token"],
      },
      body: JSON.stringify({
        name: "Expired Jane",
        email: "expired-jane@studio.co",
        roleId: memberRoleId,
        departmentId: engineeringDeptId,
      }),
    });
    assert(
      inviteRes.status === 201,
      `Invite status should be 201, got ${inviteRes.status}`,
    );

    // 2. Update invitation to be expired in DB
    const expiredToken = "expiredRawToken1234567890abcdefghijkl";
    const expiredTokenHash = hashToken(expiredToken);
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1); // 1 day ago

    await pool.query(
      `UPDATE user_invitations 
       SET token_hash = $1, expires_at = $2 
       WHERE user_id = (SELECT id FROM users WHERE email = 'expired-jane@studio.co');`,
      [expiredTokenHash, pastDate],
    );

    // 3. Verify invite should fail
    const verifyRes = await fetch(
      `${BASE_URL}/auth/verify-invite?token=${expiredToken}`,
    );
    assert(
      verifyRes.status === 400,
      `Expected 400 on expired verification, got ${verifyRes.status}`,
    );
    const verifyData = await verifyRes.json();
    assert(
      verifyData.error?.message.includes("expired"),
      `Expected 'expired' message, got '${verifyData.error?.message}'`,
    );

    // 4. Setup password should fail
    const setupRes = await fetch(`${BASE_URL}/auth/setup-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: expiredToken, password: "password123" }),
    });
    assert(
      setupRes.status === 400,
      `Expected 400 on expired password setup, got ${setupRes.status}`,
    );
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Already-Used Invitation
  // ---------------------------------------------------------------------------
  await testGroup("Already-Used Invitation", async () => {
    // 1. Admin invites user
    const inviteRes = await fetch(`${BASE_URL}/api/team/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminJar.getCookieHeader(),
        "X-CSRF-Token": adminJar.cookies["csrf_token"],
      },
      body: JSON.stringify({
        name: "Used Jane",
        email: "used-jane@studio.co",
        roleId: memberRoleId,
        departmentId: engineeringDeptId,
      }),
    });
    assert(
      inviteRes.status === 201,
      `Invite status should be 201, got ${inviteRes.status}`,
    );

    // 2. Update invitation to be used in DB
    const usedToken = "usedRawToken1234567890abcdefghijkl";
    const usedTokenHash = hashToken(usedToken);

    await pool.query(
      `UPDATE user_invitations 
       SET token_hash = $1, is_used = TRUE 
       WHERE user_id = (SELECT id FROM users WHERE email = 'used-jane@studio.co');`,
      [usedTokenHash],
    );

    // 3. Verify invite should fail
    const verifyRes = await fetch(
      `${BASE_URL}/auth/verify-invite?token=${usedToken}`,
    );
    assert(
      verifyRes.status === 400,
      `Expected 400 on used verification, got ${verifyRes.status}`,
    );
    const verifyData = await verifyRes.json();
    assert(
      verifyData.error?.message.includes("already been used"),
      `Expected 'already been used' message, got '${verifyData.error?.message}'`,
    );

    // 4. Setup password should fail
    const setupRes = await fetch(`${BASE_URL}/auth/setup-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: usedToken, password: "password123" }),
    });
    assert(
      setupRes.status === 400,
      `Expected 400 on used password setup, got ${setupRes.status}`,
    );
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Invalid Credentials
  // ---------------------------------------------------------------------------
  await testGroup("Invalid Credentials", async () => {
    // 1. Wrong email
    const res1 = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "wrong-email@gmail.com",
        password: "password123",
      }),
    });
    assert(
      res1.status === 400,
      `Expected 400 for wrong email, got ${res1.status}`,
    );

    // 2. Wrong password
    const res2 = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "info@soft7.in",
        password: "wrongpassword",
      }),
    });
    assert(
      res2.status === 400,
      `Expected 400 for wrong password, got ${res2.status}`,
    );

    // 3. Missing fields
    const res3 = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "info@soft7.in" }),
    });
    assert(
      res3.status === 400,
      `Expected 400 for missing fields, got ${res3.status}`,
    );
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: Missing CSRF Token
  // ---------------------------------------------------------------------------
  await testGroup("Missing CSRF Token", async () => {
    // Call invite route without X-CSRF-Token header
    const inviteRes = await fetch(`${BASE_URL}/api/team/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminJar.getCookieHeader(),
      },
      body: JSON.stringify({
        name: "No CSRF Jane",
        email: "nocsrf-jane@studio.co",
        roleId: memberRoleId,
        departmentId: engineeringDeptId,
      }),
    });
    assert(
      inviteRes.status === 403,
      `Expected 403 for missing CSRF token, got ${inviteRes.status}`,
    );
    const body = await inviteRes.json();
    assert(
      body.error?.message.includes("CSRF"),
      `Expected error to relate to CSRF, got '${body.error?.message}'`,
    );
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 7: Unauthorized Access (No Auth)
  // ---------------------------------------------------------------------------
  await testGroup("Unauthorized Access (No Auth)", async () => {
    // 1. GET /auth/me
    const res1 = await fetch(`${BASE_URL}/auth/me`);
    assert(
      res1.status === 401,
      `Expected 401 for /auth/me without auth, got ${res1.status}`,
    );

    // 2. GET /api/projects
    const res2 = await fetch(`${BASE_URL}/api/projects`);
    assert(
      res2.status === 401,
      `Expected 401 for /api/projects without auth, got ${res2.status}`,
    );

    // 3. GET /api/tasks
    const res3 = await fetch(`${BASE_URL}/api/tasks`);
    assert(
      res3.status === 401,
      `Expected 401 for /api/tasks without auth, got ${res3.status}`,
    );
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 8: Admin vs Member Permissions
  // ---------------------------------------------------------------------------
  await testGroup("Admin vs Member Permissions", async () => {
    // 1. Member tries to invite (Forbidden)
    const csrfTokenMember = memberJar.cookies["csrf_token"];
    const inviteResMember = await fetch(`${BASE_URL}/api/team/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: memberJar.getCookieHeader(),
        "X-CSRF-Token": csrfTokenMember,
      },
      body: JSON.stringify({
        name: "Member Invited Jane",
        email: "memberinvited-jane@studio.co",
        roleId: memberRoleId,
        departmentId: engineeringDeptId,
      }),
    });
    assert(
      inviteResMember.status === 403,
      `Expected 403 for Member invite, got ${inviteResMember.status}`,
    );

    // 2. Member reads projects (Allowed)
    const projectsRes = await fetch(`${BASE_URL}/api/projects`, {
      headers: {
        Cookie: memberJar.getCookieHeader(),
      },
    });
    assert(
      projectsRes.status === 200,
      `Expected 200 for Member reading projects, got ${projectsRes.status}`,
    );

    // 3. Member reads tasks (Allowed)
    const tasksRes = await fetch(`${BASE_URL}/api/tasks`, {
      headers: {
        Cookie: memberJar.getCookieHeader(),
      },
    });
    assert(
      tasksRes.status === 200,
      `Expected 200 for Member reading tasks, got ${tasksRes.status}`,
    );

    // 4. Admin invites user (Allowed)
    const inviteResAdmin = await fetch(`${BASE_URL}/api/team/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminJar.getCookieHeader(),
        "X-CSRF-Token": adminJar.cookies["csrf_token"],
      },
      body: JSON.stringify({
        name: "New Admin Jane",
        email: "new-jane@studio.co",
        roleId: memberRoleId,
        departmentId: engineeringDeptId,
      }),
    });
    assert(
      inviteResAdmin.status === 201,
      `Expected 201 for Admin invite, got ${inviteResAdmin.status}`,
    );
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 9: Cookie Verification
  // ---------------------------------------------------------------------------
  await testGroup("Cookie Verification", async () => {
    // 1. Fresh Admin Login to inspect raw Set-Cookie headers
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD,
      }),
    });

    const setCookies = (loginRes.headers as any).getSetCookie
      ? (loginRes.headers as any).getSetCookie()
      : [];

    let hasAccess = false;
    let hasRefresh = false;
    let hasCsrf = false;

    for (const cookieStr of setCookies) {
      const isHttpOnly = cookieStr.toLowerCase().includes("httponly");
      const hasPathSlash = cookieStr.toLowerCase().includes("path=/");

      if (cookieStr.startsWith("access_token=")) {
        hasAccess = true;
        assert(isHttpOnly, "access_token cookie must be httpOnly");
        assert(hasPathSlash, "access_token cookie path must be '/'");
      } else if (cookieStr.startsWith("refresh_token=")) {
        hasRefresh = true;
        assert(isHttpOnly, "refresh_token cookie must be httpOnly");
        assert(hasPathSlash, "refresh_token cookie path must be '/'");
      } else if (cookieStr.startsWith("csrf_token=")) {
        hasCsrf = true;
        assert(!isHttpOnly, "csrf_token cookie must NOT be httpOnly");
        assert(hasPathSlash, "csrf_token cookie path must be '/'");
      }
    }

    assert(hasAccess, "Response should set access_token cookie");
    assert(hasRefresh, "Response should set refresh_token cookie");
    assert(hasCsrf, "Response should set csrf_token cookie");
  });

  // ---------------------------------------------------------------------------
  // REPORT RESULTS
  // ---------------------------------------------------------------------------
  console.log("\n=================================");
  console.log(`📊 Test Results: ${passedCount} passed, ${failedCount} failed`);
  console.log("=================================");

  try {
    console.log("🧹 Cleaning up E2E test users from database...");
    await pool.query("DELETE FROM users WHERE email <> 'info@soft7.in';");
    console.log("✅ Cleanup complete!");
  } catch (err: any) {
    console.error("⚠️ Failed to clean up database after tests:", err.message);
  }

  await pool.end();

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
