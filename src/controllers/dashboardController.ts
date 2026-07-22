import { Request, Response, NextFunction } from "express";
import { DashboardService } from "../services/dashboardService.js";
import { LeaveService } from "../services/leaveService.js";
import { MeetingService } from "../services/meetingService.js";
import { SprintService } from "../services/sprintService.js";
import { MemberService } from "../services/memberService.js";
import { emailService } from "../services/emailService.js";

export class DashboardController {
  static async getSprints(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.query;
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
      const sprints = await DashboardService.getSprints(
        projectId as string,
        req.user?.organization_id || null,
        userCtx,
      );
      res.json(sprints);
    } catch (error) {
      next(error);
    }
  }

  static async getMeetings(req: Request, res: Response, next: NextFunction) {
    try {
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
      const meetings = await DashboardService.getMeetings(
        req.user?.organization_id || null,
        userCtx,
      );
      res.json(meetings);
    } catch (error) {
      next(error);
    }
  }

  static async getLeaves(req: Request, res: Response, next: NextFunction) {
    try {
      const { memberId } = req.query;
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
      const leaves = await DashboardService.getLeaves(
        memberId as string,
        req.user?.organization_id || null,
        userCtx,
      );
      res.json(leaves);
    } catch (error) {
      next(error);
    }
  }

  static async getMeetingById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
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
      const meeting = await DashboardService.getMeetingById(
        id,
        req.user?.organization_id || null,
        userCtx,
      );
      if (!meeting) {
        res
          .status(404)
          .json({ error: { message: "Meeting not found", status: 404 } });
        return;
      }
      res.json(meeting);
    } catch (error) {
      next(error);
    }
  }

  static async getActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const userCtx = req.user
        ? {
            id: req.user.id,
            roleName: req.user.role_name || "Teammates",
            roleRank: req.user.role_rank || 4,
            departmentId: req.user.department_id || null,
            organizationId: req.user.organization_id || null,
            isSuperAdmin: req.user.is_super_admin || false,
          }
        : null;
      const activity = await DashboardService.getActivityItems(
        req.user?.organization_id || null,
        userCtx,
      );
      res.json(activity);
    } catch (error) {
      next(error);
    }
  }

  static async createLeave(req: Request, res: Response, next: NextFunction) {
    try {
      const userCtx = req.user;
      const leaveData = req.body;

      // Enforce teammate (rank 4) can only create leave for themselves
      if (
        userCtx &&
        userCtx.role_rank === 4 &&
        leaveData.memberId !== userCtx.id
      ) {
        res
          .status(403)
          .json({
            error: {
              message: "Teammates can only apply for their own leaves",
              status: 403,
            },
          });
        return;
      }

      const leave = await LeaveService.create(
        leaveData,
        req.user?.organization_id || null,
      );
      if (req.user && leave) {
        await DashboardService.logActivity(
          req.user.id,
          "applied for leave",
          `${leave.type} leave`,
        );
      }
      res.status(201).json(leave);
    } catch (error) {
      next(error);
    }
  }

  static async deleteLeave(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userCtx = req.user;

      const existingLeave = await LeaveService.getById(
        id,
        req.user?.organization_id || null,
      );
      if (!existingLeave) {
        res
          .status(404)
          .json({ error: { message: "Leave not found", status: 404 } });
        return;
      }

      // Enforce teammate (rank 4) can only delete their own leave
      if (
        userCtx &&
        userCtx.role_rank === 4 &&
        existingLeave.memberId !== userCtx.id
      ) {
        res
          .status(403)
          .json({
            error: {
              message: "Teammates can only cancel their own leaves",
              status: 403,
            },
          });
        return;
      }

      await LeaveService.delete(id, req.user?.organization_id || null);
      if (req.user && existingLeave) {
        await DashboardService.logActivity(
          req.user.id,
          "cancelled leave",
          `${existingLeave.type} leave`,
        );
      }
      res.json(existingLeave);
    } catch (error) {
      next(error);
    }
  }

  static async createMeeting(req: Request, res: Response, next: NextFunction) {
    try {
      const meeting = await MeetingService.create(
        req.body,
        req.user?.organization_id || null,
      );
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
      const meeting = await MeetingService.update(
        id,
        req.body,
        req.user?.organization_id || null,
      );
      if (!meeting) {
        res
          .status(404)
          .json({ error: { message: "Meeting not found", status: 404 } });
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
      const meeting = await MeetingService.delete(
        id,
        req.user?.organization_id || null,
      );
      if (!meeting) {
        res
          .status(404)
          .json({ error: { message: "Meeting not found", status: 404 } });
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

  static async createSprint(req: Request, res: Response, next: NextFunction) {
    try {
      const sprint = await SprintService.create(
        req.body,
        req.user?.organization_id || null,
      );
      if (req.user && sprint) {
        await DashboardService.logActivity(
          req.user.id,
          "created sprint",
          sprint.name,
          sprint.projectId,
        );
      }
      res.status(201).json(sprint);
    } catch (error) {
      next(error);
    }
  }

  static async updateSprint(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const sprint = await SprintService.update(
        id,
        req.body,
        req.user?.organization_id || null,
      );
      if (!sprint) {
        res
          .status(404)
          .json({ error: { message: "Sprint not found", status: 404 } });
        return;
      }
      if (req.user && sprint) {
        await DashboardService.logActivity(
          req.user.id,
          "updated sprint",
          sprint.name,
          sprint.projectId,
        );
      }
      res.json(sprint);
    } catch (error) {
      next(error);
    }
  }

  static async deleteSprint(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const sprint = await SprintService.delete(
        id,
        req.user?.organization_id || null,
      );
      if (!sprint) {
        res
          .status(404)
          .json({ error: { message: "Sprint not found", status: 404 } });
        return;
      }
      if (req.user && sprint) {
        await DashboardService.logActivity(
          req.user.id,
          "deleted sprint",
          sprint.name,
          sprint.projectId,
        );
      }
      res.json(sprint);
    } catch (error) {
      next(error);
    }
  }

  static async updateLeaveStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userCtx = req.user;
      const isAuthorized =
        userCtx &&
        (userCtx.is_super_admin ||
          (userCtx.role_rank !== undefined && userCtx.role_rank <= 3) ||
          (userCtx.role_name &&
            ["Admin", "Manager", "Team leader", "Super Admin"].includes(userCtx.role_name)));

      if (!isAuthorized) {
        res.status(403).json({
          error: {
            message: "Only Managers, HR, Admins, or Super Admins can review leave requests.",
            status: 403,
          },
        });
        return;
      }

      if (status !== "APPROVED" && status !== "REJECTED") {
        res.status(400).json({
          error: {
            message: "Status must be APPROVED or REJECTED.",
            status: 400,
          },
        });
        return;
      }

      const existingLeave = await LeaveService.getById(id, userCtx.organization_id || null);
      if (!existingLeave) {
        res.status(404).json({
          error: {
            message: "Leave request not found.",
            status: 404,
          },
        });
        return;
      }

      const updated = await LeaveService.updateStatus(id, status, userCtx.organization_id || null);
      if (updated) {
        const member = await MemberService.getById(updated.memberId, userCtx.organization_id || null);
        if (member && member.email) {
          emailService.sendLeaveStatusEmail(
            member.email,
            updated.type,
            updated.startDate,
            updated.endDate,
            status
          ).catch((err) => {
            console.error("Failed to send leave status update email:", err);
          });
        }

        await DashboardService.logActivity(
          userCtx.id,
          `${status.toLowerCase()} leave request`,
          `for ${member?.name || "Member"}`
        );
      }

      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
}
