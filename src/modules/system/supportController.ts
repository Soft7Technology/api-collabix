import { Request, Response, NextFunction } from "express";
import { SuperService } from "../../services/superService.js";
import { query, queryOne } from "../../db/index.js";

export class SupportController {
  /**
   * Retrieves all support tickets for the current authenticated user's organization.
   */
  static async getTenantTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = (req.user as any)?.organization_id;
      if (!orgId) {
        return res.status(400).json({ error: { message: "User organization not found", status: 400 } });
      }

      const rows = await query(
        `SELECT t.id, t.ticket_number AS "ticketNumber", t.title, t.description, 
                t.status, t.priority, t.opened_at AS "openedAt",
                COALESCE(o.name, 'Workspace') AS "orgName",
                o.id AS "organizationId"
         FROM support_tickets t
         LEFT JOIN organizations o ON t.organization_id = o.id
         WHERE t.organization_id = $1
         ORDER BY t.opened_at DESC;`,
        [orgId]
      );

      res.json(rows);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Creates a new support ticket on behalf of the tenant organization.
   */
  static async createTenantTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = (req.user as any)?.organization_id;
      if (!orgId) {
        return res.status(400).json({ error: { message: "User organization not found", status: 400 } });
      }

      const { title, description, priority } = req.body;
      if (!title || !title.trim()) {
        return res.status(400).json({ error: { message: "Ticket subject/title is required", status: 400 } });
      }

      const ticket = await SuperService.createSupportTicket({
        title: title.trim(),
        organizationId: orgId,
        description: description?.trim() || "",
        priority: priority || "medium",
      });

      // If initial description was provided, automatically record the opening message in the conversation thread
      if (description && description.trim()) {
        await SuperService.createTicketReply(ticket.id, {
          senderId: (req.user as any)?.id,
          senderName: (req.user as any)?.name || "Client",
          senderRole: (req.user as any)?.role || "Admin",
          message: description.trim(),
        });
      }

      res.status(201).json(ticket);
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message || "Failed to create support ticket", status: 400 } });
    }
  }

  /**
   * Retrieves conversation replies for a tenant ticket, enforcing organization isolation.
   */
  static async getTenantTicketReplies(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = (req.user as any)?.organization_id;
      const { id } = req.params;

      // Verify ticket exists and belongs to this organization
      const ticket = await queryOne<any>(
        `SELECT id, organization_id FROM support_tickets WHERE id = $1;`,
        [id]
      );

      if (!ticket) {
        return res.status(404).json({ error: { message: "Support ticket not found", status: 404 } });
      }

      if (ticket.organization_id !== orgId && !(req.user as any)?.is_super_admin) {
        return res.status(403).json({ error: { message: "Access denied to this ticket", status: 403 } });
      }

      const replies = await SuperService.getTicketReplies(id);
      res.json(replies);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Adds a reply to a support ticket thread from the tenant workspace.
   */
  static async createTenantTicketReply(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = (req.user as any)?.organization_id;
      const { id } = req.params;
      const { message } = req.body;

      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: { message: "Message content is required", status: 400 } });
      }

      // Verify ticket exists and belongs to this organization
      const ticket = await queryOne<any>(
        `SELECT id, organization_id FROM support_tickets WHERE id = $1;`,
        [id]
      );

      if (!ticket) {
        return res.status(404).json({ error: { message: "Support ticket not found", status: 404 } });
      }

      if (ticket.organization_id !== orgId && !(req.user as any)?.is_super_admin) {
        return res.status(403).json({ error: { message: "Access denied to this ticket", status: 403 } });
      }

      const reply = await SuperService.createTicketReply(id, {
        senderId: (req.user as any)?.id,
        senderName: (req.user as any)?.name || "Client",
        senderRole: (req.user as any)?.role || "Member",
        message: message.trim(),
      });

      res.status(201).json(reply);
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message || "Failed to post reply", status: 400 } });
    }
  }
}
