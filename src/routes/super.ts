import { Router } from "express";
import { SuperController } from "../modules/system/superController.js";

const router = Router();

// ==========================================
// Organizations Management Routes
// ==========================================
router.get("/organizations", SuperController.getAll);
router.post("/organizations", SuperController.create);
router.patch("/organizations/:id", SuperController.update);
router.patch("/organizations/:id/plan", SuperController.updatePlan);
router.post("/organizations/:id/approve", SuperController.approve);
router.post("/organizations/:id/revoke", SuperController.revoke);
router.delete("/organizations/:id", SuperController.delete);
router.post("/organizations/:id/impersonate", SuperController.impersonate);

// ==========================================
// Platform Users Management Routes
// ==========================================
router.get("/users", SuperController.getUsers);
router.patch("/users/:id", SuperController.updateUser);
router.patch("/users/:id/role", SuperController.updateUserRole);
router.patch("/users/:id/status", SuperController.updateUserStatus);
router.delete("/users/:id", SuperController.deleteUser);

// ==========================================
// System Audit Logs Routes
// ==========================================
router.get("/logs", SuperController.getLogs);

// ==========================================
// Feature Flags Routes (Phase 2)
// ==========================================
router.get("/flags", SuperController.getFlags);
router.patch("/flags/:id", SuperController.toggleFlag);

// ==========================================
// Security Policies Routes (Phase 2)
// ==========================================
router.get("/security", SuperController.getSecurity);
router.patch("/security/:id", SuperController.toggleSecurity);

// ==========================================
// Platform Settings & API Keys Routes (Phase 2)
// ==========================================
router.get("/settings", SuperController.getSettings);
router.patch("/settings", SuperController.updateSettings);
router.post("/settings/keys/generate", SuperController.generateApiKey);
router.post("/settings/keys/revoke", SuperController.revokeKey);

// ==========================================
// Support Tickets Routes (Phase 3)
// ==========================================
router.get("/tickets", SuperController.getTickets);
router.post("/tickets", SuperController.createTicket);
router.patch("/tickets/:id", SuperController.updateTicket);
router.delete("/tickets/:id", SuperController.deleteTicket);
router.get("/tickets/:id/replies", SuperController.getTicketReplies);
router.post("/tickets/:id/replies", SuperController.createTicketReply);

// ==========================================
// Invoices & Billing Routes (Phase 3)
// ==========================================
router.get("/invoices", SuperController.getInvoices);
router.post("/invoices", SuperController.createInvoice);
router.get("/invoices/:id/pdf", SuperController.downloadInvoicePdf);

export { router };
export default router;
