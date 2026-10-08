import { Request, Response, NextFunction } from "express";
import { MeetingService } from "../../services/meetingService.js";
import { DashboardService } from "../../services/dashboardService.js";

// In-memory sliding window rate limiter for instant meetings (DoS prevention)
const instantMeetingRateMap = new Map<string, number[]>();
const INSTANT_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const INSTANT_MAX_CREATIONS = 5; // Max 5 instant meetings per 10 mins per user

function checkInstantMeetingRateLimit(userId: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const timestamps = instantMeetingRateMap.get(userId) || [];
  const activeTimestamps = timestamps.filter((t) => now - t < INSTANT_LIMIT_WINDOW_MS);

  if (activeTimestamps.length >= INSTANT_MAX_CREATIONS) {
    const oldest = activeTimestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + INSTANT_LIMIT_WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  activeTimestamps.push(now);
  instantMeetingRateMap.set(userId, activeTimestamps);
  return { allowed: true, retryAfterSeconds: 0 };
}

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
    } catch (error: any) {
      if (error?.status === 403) {
        res.status(403).json({ error: { message: error.message || "Forbidden: Access denied", status: 403 } });
        return;
      }
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
    } catch (error: any) {
      if (error?.status === 403) {
        res.status(403).json({ error: { message: error.message || "Forbidden: Access denied", status: 403 } });
        return;
      }
      next(error);
    }
  }

  static async createInstantMeeting(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user?.organization_id || null;
      const userId = req.user?.id || "anonymous";

      // 1. Sliding window rate limiting
      const rateCheck = checkInstantMeetingRateLimit(userId);
      if (!rateCheck.allowed) {
        res.status(429).json({
          error: {
            message: `Rate limit reached: Maximum 5 instant meetings per 10 minutes. Please retry in ${rateCheck.retryAfterSeconds}s.`,
            status: 429,
            retryAfterSeconds: rateCheck.retryAfterSeconds,
          },
        });
        return;
      }

      // 2. Background cleanup of stale instant meetings
      MeetingService.cleanupStaleInstantMeetings(organizationId).catch(() => {});

      // 3. Active Room Reuse: If user already has an active live room, reuse it unless explicitly forced
      if (req.user?.id && !req.body.forceNew) {
        const activeExisting = await MeetingService.findActiveInstantMeeting(req.user.id, organizationId);
        if (activeExisting) {
          res.status(200).json(activeExisting);
          return;
        }
      }

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
    } catch (error: any) {
      if (error?.status === 403 || error?.status === 429) {
        res.status(error.status).json({ error: { message: error.message, status: error.status } });
        return;
      }
      next(error);
    }
  }

  static async verifyPasscode(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { passcode } = req.body;
      const organizationId = req.user?.organization_id || null;

      const result = await MeetingService.verifyPasscode(id, passcode, organizationId);
      if (!result.valid) {
        res.status(401).json({ error: { message: result.message || "Invalid passcode", status: 401 } });
        return;
      }

      res.json({
        valid: true,
        meetingLink: result.meetingLink,
        platform: result.platform,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const organizationId = req.user?.organization_id || null;
      const messages = await MeetingService.getMeetingMessages(id, organizationId);
      res.json(messages);
    } catch (error) {
      next(error);
    }
  }

  static async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const organizationId = req.user?.organization_id || null;
      const message = await MeetingService.createMeetingMessage(
        id,
        req.body,
        organizationId,
        req.user
      );
      res.status(201).json(message);
    } catch (error) {
      next(error);
    }
  }
}
