import { Router } from "express";
import { SuperController } from "../modules/system/superController.js";

const router = Router();

// Retrieve all organizations
router.get("/organizations", SuperController.getAll);

// Create a new organization
router.post("/organizations", SuperController.createOrganization);

// Update a specific organization's details
router.patch("/organizations/:id", SuperController.updateOrganization);

// Approve a specific organization
router.post("/organizations/:id/approve", SuperController.approve);

// Revoke a specific organization
router.post("/organizations/:id/revoke", SuperController.revoke);

// Update a specific organization's plan
router.patch("/organizations/:id/plan", SuperController.updatePlan);

// Delete a specific organization
router.delete("/organizations/:id", SuperController.delete);

// Impersonate a specific organization
router.post("/organizations/:id/impersonate", SuperController.impersonate);

// Retrieve all users across organizations
router.get("/users", SuperController.getAllUsers);

// Update user details
router.patch("/users/:id", SuperController.updateUser);

// Update user role
router.patch("/users/:id/role", SuperController.updateUserRole);

// Update user status (Active / Suspended)
router.patch("/users/:id/status", SuperController.updateUserStatus);

// Delete user
router.delete("/users/:id", SuperController.deleteUser);

// Retrieve unified platform system & audit logs
router.get("/logs", SuperController.getSystemLogs);

export { router };
export default router;
