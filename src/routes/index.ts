import { Router } from "express";
import { ProjectController } from "../controllers/projectController.js";
import { MonitoringController, upload } from "../controllers/monitoringController.js";
import { TaskController } from "../controllers/taskController.js";
import { MemberController } from "../controllers/memberController.js";
import { DashboardController } from "../controllers/dashboardController.js";
import { DiscussionController } from "../controllers/discussionController.js";
import { router as superRouter } from "./super.js";
import { validate } from "../middleware/validate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { AuthController } from "../controllers/authController.js";
import {
  createProjectSchema,
  updateProjectSchema,
  createTaskSchema,
  updateTaskSchema,
  createMemberSchema,
  updateMemberRoleSchema,
  inviteMemberSchema,
  createSprintSchema,
  updateSprintSchema,
  updateProfileSchema,
  changePasswordSchema,
  updateOrganizationSchema,
} from "../schemas/index.js";

const router = Router();

// Projects routes
router.get("/projects", ProjectController.getAll);
router.get("/projects/:id", ProjectController.getById);
router.post(
  "/projects",
  validate(createProjectSchema),
  ProjectController.create,
);
router.patch(
  "/projects/:id",
  validate(updateProjectSchema),
  ProjectController.update,
);
router.delete(
  "/projects/:id",
  requirePermission("admin:manage"),
  ProjectController.delete,
);

// Discussion routes
router.get("/projects/:projectId/discussions", DiscussionController.getByProject);
router.post("/projects/:projectId/discussions", DiscussionController.create);
router.get("/discussions/:discussionId/replies", DiscussionController.getReplies);
router.post("/discussions/:discussionId/replies", DiscussionController.addReply);
router.patch("/discussions/:id/resolve", DiscussionController.toggleResolve);
router.delete("/discussions/:id", DiscussionController.delete);

// Tasks routes
router.get("/tasks", TaskController.getAll);
router.get("/tasks/:id", TaskController.getById);
router.post("/tasks", validate(createTaskSchema), TaskController.create);
router.patch("/tasks/:id", validate(updateTaskSchema), TaskController.update);
router.delete("/tasks/:id", TaskController.delete);

// Team members routes
router.get("/team", MemberController.getAll);
router.get("/team/:id", MemberController.getById);
router.post("/team", validate(createMemberSchema), MemberController.create);
router.post(
  "/team/invite",
  requirePermission("admin:manage"),
  validate(inviteMemberSchema),
  MemberController.invite,
);
router.patch(
  "/team/:id",
  validate(updateMemberRoleSchema),
  MemberController.updateRole,
);
router.patch(
  "/team/:id/task-rights",
  MemberController.updateTaskRights,
);
router.delete(
  "/team/:id",
  requirePermission("admin:manage"),
  MemberController.delete,
);

// Roles and Departments
router.get("/roles", MemberController.getRoles);
router.get("/departments", MemberController.getDepartments);

// User Profile, Security & Organization settings
router.patch(
  "/users/profile",
  validate(updateProfileSchema),
  AuthController.updateProfile,
);
router.post(
  "/users/change-password",
  validate(changePasswordSchema),
  AuthController.changePassword,
);
router.patch(
  "/organization",
  requirePermission("admin:manage"),
  validate(updateOrganizationSchema),
  AuthController.updateOrganization,
);

// Dashboard / Read-only resources
router.get("/sprints", DashboardController.getSprints);
router.post(
  "/sprints",
  validate(createSprintSchema),
  DashboardController.createSprint,
);
router.patch(
  "/sprints/:id",
  validate(updateSprintSchema),
  DashboardController.updateSprint,
);
router.delete(
  "/sprints/:id",
  requirePermission("admin:manage"),
  DashboardController.deleteSprint,
);

router.get("/meetings", DashboardController.getMeetings);
router.get("/meetings/:id", DashboardController.getMeetingById);
router.post("/meetings", DashboardController.createMeeting);
router.patch("/meetings/:id", DashboardController.updateMeeting);
router.delete("/meetings/:id", DashboardController.deleteMeeting);

router.get("/leaves", DashboardController.getLeaves);
router.post("/leaves", DashboardController.createLeave);
router.patch("/leaves/:id/status", DashboardController.updateLeaveStatus);
router.delete("/leaves/:id", DashboardController.deleteLeave);

router.get("/activity", DashboardController.getActivity);

// Screen monitoring routes
router.post(
  "/monitoring/upload",
  upload.single("screenshot"),
  MonitoringController.uploadScreenshot,
);
router.post("/monitoring/stop", MonitoringController.stopMonitoring);
router.get("/monitoring/screenshots", MonitoringController.getScreenshots);
router.delete("/monitoring/screenshots/:id", MonitoringController.deleteScreenshot);

// Platform administration stays in this API and is guarded again inside each
// controller action with an explicit is_super_admin check.
router.use("/super", superRouter);

export { router };
export default router;
