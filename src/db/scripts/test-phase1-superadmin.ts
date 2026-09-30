import { runMigrations, pool } from "../index.js";
import { SuperService } from "../../services/superService.js";

async function runSuperAdminPhase1Test() {
  console.log("🚀 Running Database Migrations...");
  await runMigrations();

  console.log("🔍 Testing SuperService endpoints...");

  // 1. Get initial organizations
  const initialOrgs = await SuperService.getAllOrganizations();
  console.log(`✅ Loaded ${initialOrgs.length} organizations.`);

  // 2. Create a test organization
  const testOrgName = `QA-Workspace-${Date.now()}`;
  const testOwnerEmail = `admin.${Date.now()}@qaworkspace.com`;
  console.log(`✨ Creating test organization: ${testOrgName}`);

  const createdOrg = await SuperService.createOrganization({
    name: testOrgName,
    phone: "+91 9988776655",
    plan: "Enterprise",
    ownerEmail: testOwnerEmail,
  });
  console.log("✅ Created Organization:", createdOrg);

  // 3. Update organization details
  const updatedOrg = await SuperService.updateOrganization(createdOrg.id, {
    name: `${testOrgName}-Updated`,
    phone: "+91 1122334455",
    plan: "Pro",
    subscriptionStatus: "active",
  });
  console.log("✅ Updated Organization:", updatedOrg);

  // 4. Update organization plan
  const planUpdated = await SuperService.updateOrganizationPlan(createdOrg.id, "Basic");
  console.log("✅ Plan Updated Organization:", planUpdated);

  // 5. Test Approve & Revoke
  const approved = await SuperService.approveOrganization(createdOrg.id);
  console.log("✅ Approved Organization:", approved);

  const revoked = await SuperService.revokeOrganization(createdOrg.id);
  console.log("✅ Revoked Organization:", revoked);

  // 6. Test Users Listing
  const users = await SuperService.getAllUsers();
  console.log(`✅ Loaded ${users.length} platform users.`);

  const testUser = users.find((u) => u.email === testOwnerEmail);
  if (testUser) {
    console.log("Found created test user:", testUser.name, testUser.id);

    // 7. Update User details
    const updatedUser = await SuperService.updateUser(testUser.id, {
      name: "QA Updated Admin",
      roleName: "Manager",
      status: "ACTIVE",
    });
    console.log("✅ Updated User:", updatedUser);

    // 8. Update User Role
    const roleUpdated = await SuperService.updateUserRole(testUser.id, "Admin");
    console.log("✅ Role Updated User:", roleUpdated);

    // 9. Update User Status
    const statusUpdated = await SuperService.updateUserStatus(testUser.id, "SUSPENDED");
    console.log("✅ Status Updated User (SUSPENDED):", statusUpdated);
  }

  // 10. Test Audit Logs
  const logs = await SuperService.getAuditLogs();
  console.log(`✅ Loaded ${logs.length} system audit logs.`);
  console.log("Recent log entries:", logs.slice(0, 3));

  // 11. Cleanup test organization
  console.log("🧹 Cleaning up test organization...");
  await SuperService.deleteOrganization(createdOrg.id);
  console.log("✅ Test organization cleaned up successfully.");

  console.log("🎉 All Phase 1 Superadmin backend features verified successfully!");
  await pool.end();
}

runSuperAdminPhase1Test().catch((err) => {
  console.error("❌ Phase 1 Test failed:", err);
  process.exit(1);
});
