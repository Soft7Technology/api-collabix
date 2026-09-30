import { Request, Response, NextFunction } from "express";
import { SuperService } from "../../services/superService.js";
import { AuthController } from "../auth/authController.js";

function requireSuperAdmin(req: Request, res: Response): boolean {
  if (!req.user || !req.user.is_super_admin) {
    res.status(403).json({
      error: {
        message: "Forbidden: Super Admin access required.",
        status: 403,
      },
    });
    return false;
  }
  return true;
}

export class SuperController {
  static createInvoice(arg0: string, createInvoice: any) {
      throw new Error("Method not implemented.");
  }
  static downloadInvoicePdf(arg0: string, downloadInvoicePdf: any) {
      throw new Error("Method not implemented.");
  }
  // ==========================================
  // Organizations
  // ==========================================

  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const orgs = await SuperService.getAllOrganizations();
      res.json(orgs);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { name, ownerEmail, phone, plan } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: { message: "Organization name is required.", status: 400 } });
        return;
      }
      const created = await SuperService.createOrganization({
        name,
        ownerEmail,
        phone,
        plan,
      });
      res.status(201).json(created);
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const { name, phone, subscriptionStatus, trialEndsAt, plan, isApproved } = req.body;
      const updated = await SuperService.updateOrganization(id, {
        name,
        phone,
        subscriptionStatus,
        trialEndsAt,
        plan,
        isApproved,
      });
      res.json({
        message: "Organization updated successfully.",
        organization: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async updatePlan(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const { plan } = req.body;
      if (!plan || typeof plan !== "string") {
        res.status(400).json({ error: { message: "Plan tier is required.", status: 400 } });
        return;
      }
      const updated = await SuperService.updateOrganizationPlan(id, plan);
      res.json({
        message: "Organization plan updated successfully.",
        organization: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async approve(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const updated = await SuperService.approveOrganization(id);
      res.json({
        message: "Organization successfully approved.",
        organization: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async revoke(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const updated = await SuperService.revokeOrganization(id);
      res.json({
        message: "Organization successfully revoked.",
        organization: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      await SuperService.deleteOrganization(id);
      res.json({
        message: "Organization successfully deleted.",
        id,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async impersonate(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const { user, organization, rawRefreshToken } = await SuperService.impersonateOrganization(id);

      AuthController.setAuthCookies(req, res, user.id, rawRefreshToken);

      const clientAppUrl =
        process.env.CLIENT_APP_URL ||
        (process.env.NODE_ENV === "production"
          ? "https://collabix.soft7.in"
          : "http://localhost:8001");

      res.json({
        message: `Successfully impersonated organization '${organization.name}'.`,
        user,
        organization,
        redirectUrl: clientAppUrl,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  // ==========================================
  // Platform Users
  // ==========================================

  static async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const users = await SuperService.getAllUsers();
      res.json(users);
    } catch (error) {
      next(error);
    }
  }

  static async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const { name, email, roleName, status } = req.body;
      const updated = await SuperService.updateUser(id, {
        name,
        email,
        roleName,
        status,
      });
      res.json({
        message: "User updated successfully.",
        user: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async updateUserRole(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const { roleName } = req.body;
      if (!roleName) {
        res.status(400).json({ error: { message: "Role name is required.", status: 400 } });
        return;
      }
      const updated = await SuperService.updateUserRole(id, roleName);
      res.json({
        message: "User role updated successfully.",
        user: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async updateUserStatus(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const { status } = req.body;
      if (!status) {
        res.status(400).json({ error: { message: "Status is required.", status: 400 } });
        return;
      }
      const updated = await SuperService.updateUserStatus(id, status);
      res.json({
        message: "User status updated successfully.",
        user: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const result = await SuperService.deleteUser(id);
      res.json({
        message: "User deleted successfully.",
        id: result.id,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  // ==========================================
  // System Audit Logs
  // ==========================================

  static async getLogs(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const logs = await SuperService.getAuditLogs(category);
      res.json(logs);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // Feature Flags (Phase 2)
  // ==========================================

  static async getFlags(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const flags = await SuperService.getFeatureFlags();
      res.json(flags);
    } catch (error) {
      next(error);
    }
  }

  static async toggleFlag(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const { enabled } = req.body;
      const updated = await SuperService.toggleFeatureFlag(id, Boolean(enabled));
      res.json({
        message: `Feature flag '${updated.label}' updated.`,
        flag: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  // ==========================================
  // Security Policies (Phase 2)
  // ==========================================

  static async getSecurity(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const policies = await SuperService.getSecurityPolicies();
      res.json(policies);
    } catch (error) {
      next(error);
    }
  }

  static async toggleSecurity(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const { enabled } = req.body;
      const updated = await SuperService.toggleSecurityPolicy(id, Boolean(enabled));
      res.json({
        message: `Security policy '${updated.label}' updated.`,
        policy: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  // ==========================================
  // Platform Settings & API Keys (Phase 2)
  // ==========================================

  static async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const settings = await SuperService.getPlatformSettings();
      res.json(settings);
    } catch (error) {
      next(error);
    }
  }

  static async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { platformName, supportEmail, defaultTimezone, accentColor } = req.body;
      const updated = await SuperService.updatePlatformSettings({
        platformName,
        supportEmail,
        defaultTimezone,
        accentColor,
      });
      res.json({
        message: "Platform settings updated successfully.",
        settings: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async generateApiKey(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const result = await SuperService.generateApiKey();
      res.json({
        message: "New API Key generated successfully.",
        ...result,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async revokeKey(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { keyType } = req.body; // 'api_key' or 'webhook'
      const result = await SuperService.revokeKey(keyType === "webhook" ? "webhook" : "api_key");
      res.json({
        message: `${keyType === "webhook" ? "Webhook secret" : "API key"} revoked and rotated.`,
        ...result,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  // ==========================================
  // Support Tickets (Phase 3)
  // ==========================================

  static async getTickets(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const tickets = await SuperService.getSupportTickets();
      res.json(tickets);
    } catch (error) {
      next(error);
    }
  }

  static async createTicket(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { title, organizationId, description, priority } = req.body;
      if (!title || !organizationId) {
        res.status(400).json({ error: { message: "Title and Organization are required.", status: 400 } });
        return;
      }
      const ticket = await SuperService.createSupportTicket({
        title,
        organizationId,
        description,
        priority,
      });
      res.status(201).json(ticket);
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async updateTicket(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const { status, priority } = req.body;
      const ticket = await SuperService.updateSupportTicket(id, { status, priority });
      res.json({
        message: "Ticket updated successfully.",
        ticket,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async deleteTicket(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const result = await SuperService.deleteSupportTicket(id);
      res.json({
        message: "Ticket deleted successfully.",
        id: result.id,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async getTicketReplies(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const replies = await SuperService.getTicketReplies(id);
      res.json(replies);
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async createTicketReply(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const { id } = req.params;
      const { message, senderName, senderRole } = req.body;
      if (!message || typeof message !== "string" || !message.trim()) {
        res.status(400).json({ error: { message: "Message is required.", status: 400 } });
        return;
      }
      const reply = await SuperService.createTicketReply(id, {
        senderId: req.user?.id,
        senderName: senderName || req.user?.name || "Super Admin",
        senderRole: senderRole || "Super Admin",
        message,
      });
      res.status(201).json(reply);
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  // ==========================================
  // Billing & Invoices (Phase 3)
  // ==========================================

  static async getInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const invoices = await SuperService.getInvoices();
      res.json(invoices);
    } catch (error) {
      next(error);
    }
  }
}
