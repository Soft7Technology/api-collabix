export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus =
  "backlog" | "todo" | "in_progress" | "testing" | "done";
export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  avatarColor: string;
  initials: string;
  passwordHash?: string | null;
  roleId?: string;
  departmentId?: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role_id: string;
        permissions: string[];
        role_name?: string;
        role_rank?: number;
        can_create_tasks?: boolean;
        department_id?: string | null;
        department_name?: string | null;
        is_super_admin: boolean;
        organization_id?: string | null;
        organization?: {
          id: string;
          name: string;
          timezone: string;
          subscription_status: string;
          trial_ends_at: string;
          is_approved: boolean;
          created_at?: string;
        } | null;
      };
    }
  }
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string;
  projectId: string;
  dueDate: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  progress: number;
  memberIds: string[];
  taskCount: number;
  dueDate: string;
  color: string;
}

export interface ActivityItem {
  id: string;
  actorId: string;
  action: string;
  target: string;
  timestamp: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface MeetingAttendee {
  id: string;
  name: string;
  email?: string;
  avatarColor?: string;
  role?: string;
  status?: string;
}

export interface Meeting {
  id: string;
  title: string;
  projectId?: string | null;
  projectName?: string | null;
  platform?: string;
  meetingLink?: string;
  meetingCode?: string;
  passcode?: string;
  hostId?: string;
  hostName?: string;
  teamDepartment?: string;
  description?: string;
  agenda?: string[];
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
  timezone?: string;
  status?: "upcoming" | "live" | "completed" | "cancelled";
  recordingUrl?: string;
  notes?: string;
  attendees: MeetingAttendee[] | string[];
  organizationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Leave {
  id: string;
  memberId: string;
  type: "vacation" | "sick" | "parental";
  startDate: string;
  endDate: string;
}

export interface RazorpaySubscriptionResponse {
  id: string;
  entity: string;
  status: string;
  plan_id: string;
  total_count: number;
  paid_count: number;
  remaining_count: number;
  quantity: number;
}
