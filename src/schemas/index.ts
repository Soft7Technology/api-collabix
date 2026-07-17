import { z } from "zod";

const projectStatusEnum = z.enum([
  "active",
  "on_hold",
  "completed",
  "archived",
]);
const taskStatusEnum = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "testing",
  "done",
]);
const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);

// Project schemas
export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().default(""),
    status: projectStatusEnum.default("active"),
    dueDate: z.string().min(1, "Due date is required"),
    color: z.string().min(1, "Color is required"),
    memberIds: z.array(z.string()).default([]),
  }),
});

export const updateProjectSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    status: projectStatusEnum.optional(),
    progress: z.number().min(0).max(100).optional(),
    dueDate: z.string().optional(),
    color: z.string().optional(),
    memberIds: z.array(z.string()).optional(),
  }),
});

// Task schemas
export const createTaskSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    status: taskStatusEnum.default("todo"),
    priority: priorityEnum.default("medium"),
    assigneeId: z.string().min(1, "Assignee ID is required"),
    projectId: z.string().min(1, "Project ID is required"),
    dueDate: z.string().min(1, "Due date is required"),
  }),
});

export const updateTaskSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
  body: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    status: taskStatusEnum.optional(),
    priority: priorityEnum.optional(),
    assigneeId: z.string().optional(),
    projectId: z.string().optional(),
    dueDate: z.string().optional(),
  }),
});

// Member schemas
export const createMemberSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    role: z.string().min(1, "Role is required"),
    email: z.string().email("Invalid email address"),
    avatarColor: z.string().min(1, "Avatar color is required"),
    initials: z.string().min(1, "Initials are required"),
  }),
});

export const updateMemberRoleSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
  body: z.object({
    role: z.string().min(1, "Role is required"),
  }),
});

export const inviteMemberSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
    roleId: z.string().uuid(),
    role: z.string().optional(),
    departmentId: z.string().uuid().optional(),
    projectId: z.string().optional(),
  }),
});

export const createSprintSchema = z.object({
  body: z.object({
    projectId: z.string().min(1, "Project ID is required"),
    name: z.string().min(1, "Name is required"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
  }),
});

export const updateSprintSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
  body: z.object({
    projectId: z.string().optional(),
    name: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
  }),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: z
        .string()
        .min(8, "New password must be at least 8 characters long"),
      confirmNewPassword: z
        .string()
        .min(8, "Confirm password must be at least 8 characters long"),
    })
    .refine((data) => data.newPassword === data.confirmNewPassword, {
      message: "New passwords do not match",
      path: ["confirmNewPassword"],
    }),
});

export const updateOrganizationSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Company name is required"),
    timezone: z.string().min(1, "Timezone is required"),
  }),
});
