import { Router } from "express";
import { SuperController } from "../controllers/superController.js";

const router = Router();

// Retrieve all organizations
router.get("/organizations", SuperController.getAll);

// Approve a specific organization
router.post("/organizations/:id/approve", SuperController.approve);

// Revoke a specific organization
router.post("/organizations/:id/revoke", SuperController.revoke);

// Delete a specific organization
router.delete("/organizations/:id", SuperController.delete);

export { router };
export default router;
