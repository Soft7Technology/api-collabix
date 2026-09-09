import { Request, Response, NextFunction } from "express";
import { MeetingService } from "../../services/meetingService.js";
import { DashboardService } from "../../services/dashboardService.js";

export class MeetingController {
  static async getMeetings(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user?.organization_id || null;
      const { tab, team, status, search, date } = req.query;

      const userCtx = req.user
        ? {
            id: req.user.id,
            roleName: req.user.role_name || "Teammates",
            roleRank: req.user.role_rank || 4,
            departmentId: req.user.department_id || null,
            organizationId: req.user.organization_id || null,
            isSuperAdmin: req.user.is_super_admin || false,
          }
        : undefined;

      const meetings = await MeetingService.getAll({
        tab: (tab as "upcoming" | "past") || undefined,
        team: (team as string) || undefined,
        status: (status as string) || undefined,
        search: (search as string) || undefined,
        date: (date as string) || undefined,
        organizationId,
        userCtx,
      });

      res.json(meetings);
    } catch (error) {
      next(error);
    }
  }

  static async getMeetingById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const organizationId = req.user?.organization_id || null;

      const userCtx = req.user
        ? {
            id: req.user.id,
            roleName: req.user.role_name || "Teammates",
            roleRank: req.user.role_rank || 4,
            departmentId: req.user.department_id || null,
            organizationId: req.user.organization_id || null,
            isSuperAdmin: req.user.is_super_admin || false,
          }
        : undefined;

      const meeting = await MeetingService.getById(id, organizationId, userCtx);
      if (!meeting) {
        res.status(404).json({ error: { message: "Meeting not found", status: 404 } });
        return;
      }

      res.json(meeting);
    } catch (error) {
      next(error);
    }
  }

  static async createMeeting(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user?.organization_id || null;
      const meeting = await MeetingService.create(req.body, organizationId, req.user);

      if (req.user && meeting) {
        await DashboardService.logActivity(
          req.user.id,
          "scheduled meeting",
          meeting.title,
        );
      }

      res.status(201).json(meeting);
    } catch (error) {
      next(error);
    }
  }

  static async updateMeeting(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const organizationId = req.user?.organization_id || null;

      const userCtx = req.user
        ? {
            id: req.user.id,
            roleName: req.user.role_name || "Teammates",
            roleRank: req.user.role_rank || 4,
            departmentId: req.user.department_id || null,
            organizationId: req.user.organization_id || null,
            isSuperAdmin: req.user.is_super_admin || false,
          }
        : undefined;

      const meeting = await MeetingService.update(id, req.body, organizationId, userCtx);
      if (!meeting) {
        res.status(404).json({ error: { message: "Meeting not found", status: 404 } });
        return;
      }

      if (req.user && meeting) {
        await DashboardService.logActivity(
          req.user.id,
          "updated meeting",
          meeting.title,
        );
      }

      res.json(meeting);
    } catch (error) {
      next(error);
    }
  }

  static async deleteMeeting(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const organizationId = req.user?.organization_id || null;

      const userCtx = req.user
        ? {
            id: req.user.id,
            roleName: req.user.role_name || "Teammates",
            roleRank: req.user.role_rank || 4,
            departmentId: req.user.department_id || null,
            organizationId: req.user.organization_id || null,
            isSuperAdmin: req.user.is_super_admin || false,
          }
        : undefined;

      const meeting = await MeetingService.delete(id, organizationId, userCtx);
      if (!meeting) {
        res.status(404).json({ error: { message: "Meeting not found", status: 404 } });
        return;
      }

      if (req.user && meeting) {
        await DashboardService.logActivity(
          req.user.id,
          "cancelled meeting",
          meeting.title,
        );
      }

      res.json(meeting);
    } catch (error) {
      next(error);
    }
  }

  static async createInstantMeeting(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user?.organization_id || null;
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const startHours = String(now.getHours()).padStart(2, "0");
      const startMins = String(now.getMinutes()).padStart(2, "0");
      const startTime = `${startHours}:${startMins}`;
      
      const endObj = new Date(now.getTime() + 30 * 60000);
      const endHours = String(endObj.getHours()).padStart(2, "0");
      const endMins = String(endObj.getMinutes()).padStart(2, "0");
      const endTime = `${endHours}:${endMins}`;

      const title = req.body.title || `Quick Sync - ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
      const teamDepartment = req.body.teamDepartment || "Development Team";

      const meeting = await MeetingService.create(
        {
          title,
          platform: "teams",
          teamDepartment,
          date: dateStr,
          startTime,
          endTime,
          durationMinutes: 30,
          status: "live",
          description: "Instant sync meeting started from Team Meet console.",
          attendees: req.body.attendees || [],
        },
        organizationId,
        req.user,
      );

      if (req.user && meeting) {
        await DashboardService.logActivity(
          req.user.id,
          "started instant meeting",
          meeting.title,
        );
      }

      res.status(201).json(meeting);
    } catch (error) {
      next(error);
    }
  }
}
