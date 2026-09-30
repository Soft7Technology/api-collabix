import { db, pool } from "../db/index.js";

export interface CreateWorkReportInput {
  title: string;
  type?: "weekly" | "monthly" | "yearly";
  period: string;
  startDate?: string;
  endDate?: string;
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
  project?: string;
  projectId?: string | null;
  projectName?: string;
  workCategory?: string;
  summary?: string;
  tasks?: any[];
  achievements?: string[];
  challenges?: string;
  challengesStatus?: "resolved" | "in_progress" | "blocked";
  skills?: string[];
  nextGoals?: string[];
  attachments?: any[];
  dailyActivities?: any[];
  projectBreakdowns?: any[];
  timelineMilestones?: any[];
  yearlyAchievements?: string[];
  status?: "draft" | "submitted" | "approved" | "changes_requested";
  submittedOn?: string;
}

export interface UpdateWorkReportInput extends Partial<CreateWorkReportInput> {}

export interface WorkReportFilters {
  type?: "weekly" | "monthly" | "yearly" | "all";
  status?: string;
  project?: string;
  employeeId?: string;
  departmentId?: string;
  search?: string;
  onlyMine?: boolean;
  roleFilter?: "employee" | "admin";
  organizationId?: string | null;
  userCtx?: {
    id: string;
    name?: string;
    roleName?: string;
    roleRank?: number;
    departmentId?: string | null;
    organizationId?: string | null;
    isSuperAdmin?: boolean;
    permissions?: string[];
  };
}

export class DocumentationService {
  /**
   * Helper to format a raw SQL database row into a structured camelCase WorkReport object
   */
  private static formatReport(row: any): any {
    if (!row) return null;

    const initials =
      row.user_initials ||
      (row.user_name
        ? row.user_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)
        : "TM");

    const employee = {
      id: row.user_id || row.author_id || "",
      name: row.user_name || "Team Member",
      email: row.user_email || "",
      department: row.user_department_name || row.department_name || "Engineering",
      designation: row.user_role_name || row.role_name || "Team Member",
      avatarColor: row.user_avatar_color || "var(--terracotta)",
      initials,
    };

    let dateRange = undefined;
    if (row.start_date || row.end_date) {
      dateRange = {
        startDate: row.start_date || "",
        endDate: row.end_date || "",
      };
    }

    return {
      id: row.id,
      title: row.title,
      type: row.type || "weekly",
      period: row.period || "",
      dateRange,
      project: row.project_name || row.project || "",
      projectId: row.project_id || null,
      workCategory: row.work_category || "Development",
      summary: row.summary || "",
      tasks: Array.isArray(row.tasks) ? row.tasks : typeof row.tasks === "string" ? JSON.parse(row.tasks) : [],
      achievements: Array.isArray(row.achievements)
        ? row.achievements
        : typeof row.achievements === "string"
        ? JSON.parse(row.achievements)
        : [],
      challenges: row.challenges || "",
      challengesStatus: row.challenges_status || "resolved",
      skills: Array.isArray(row.skills) ? row.skills : typeof row.skills === "string" ? JSON.parse(row.skills) : [],
      nextGoals: Array.isArray(row.next_goals)
        ? row.next_goals
        : typeof row.next_goals === "string"
        ? JSON.parse(row.next_goals)
        : [],
      attachments: Array.isArray(row.attachments)
        ? row.attachments
        : typeof row.attachments === "string"
        ? JSON.parse(row.attachments)
        : [],
      dailyActivities: Array.isArray(row.daily_activities)
        ? row.daily_activities
        : typeof row.daily_activities === "string"
        ? JSON.parse(row.daily_activities)
        : [],
      projectBreakdowns: Array.isArray(row.project_breakdowns)
        ? row.project_breakdowns
        : typeof row.project_breakdowns === "string"
        ? JSON.parse(row.project_breakdowns)
        : [],
      timelineMilestones: Array.isArray(row.timeline_milestones)
        ? row.timeline_milestones
        : typeof row.timeline_milestones === "string"
        ? JSON.parse(row.timeline_milestones)
        : [],
      yearlyAchievements: Array.isArray(row.yearly_achievements)
        ? row.yearly_achievements
        : typeof row.yearly_achievements === "string"
        ? JSON.parse(row.yearly_achievements)
        : [],
      employee,
      managerReview:
        typeof row.manager_review === "object" && row.manager_review !== null
          ? row.manager_review
          : typeof row.manager_review === "string"
          ? JSON.parse(row.manager_review)
          : undefined,
      status: row.status || "draft",
      submittedOn: row.submitted_on || undefined,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Helper to check if a user context is an admin, manager, or reviewer role
   */
  private static isUserAdmin(userCtx?: any): boolean {
    if (!userCtx) return false;
    if (userCtx.isSuperAdmin || userCtx.is_super_admin) return true;
    const role = (userCtx.roleName || userCtx.role_name || "").toLowerCase();
    if (role === "admin" || role === "manager" || role === "super admin" || role === "team leader" || role === "team lead" || role === "hr") return true;
    const rank = userCtx.roleRank !== undefined ? userCtx.roleRank : userCtx.role_rank;
    if (rank !== undefined && Number(rank) <= 3 && role !== "teammates" && role !== "teammate") return true;
    if (userCtx.permissions && (userCtx.permissions.includes("admin:manage") || userCtx.permissions.includes("*"))) return true;
    return false;
  }

  /**
   * Fetch all reports with filters and permissions
   */
  static async getAll(filters: WorkReportFilters): Promise<any[]> {
    const {
      type,
      status,
      project,
      employeeId,
      departmentId,
      search,
      onlyMine,
      organizationId,
      userCtx,
    } = filters;

    const isAdmin = this.isUserAdmin(userCtx);

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Multi-tenant check
    if (organizationId) {
      conditions.push(`r.organization_id = $${paramIndex++}`);
      values.push(organizationId);
    }

    // Role-based visibility enforcement
    if (!isAdmin || onlyMine || filters.roleFilter === "employee") {
      if (userCtx?.id) {
        conditions.push(`r.user_id = $${paramIndex++}`);
        values.push(userCtx.id);
      }
    } else if (employeeId && employeeId !== "all") {
      conditions.push(`r.user_id = $${paramIndex++}`);
      values.push(employeeId);
    }

    // Type filter
    if (type && type !== "all") {
      conditions.push(`r.type = $${paramIndex++}`);
      values.push(type);
    }

    // Status filter
    if (status && status !== "all") {
      conditions.push(`r.status = $${paramIndex++}`);
      values.push(status);
    }

    // Project filter
    if (project && project !== "all") {
      conditions.push(`(r.project_name ILIKE $${paramIndex} OR r.project_id = $${paramIndex})`);
      values.push(`%${project}%`);
      paramIndex++;
    }

    // Department filter (admin only)
    if (departmentId && departmentId !== "all") {
      conditions.push(`(u.department_id::text = $${paramIndex} OR d.name ILIKE $${paramIndex})`);
      values.push(departmentId);
      paramIndex++;
    }

    // Search query (title, summary, employee name)
    if (search && search.trim() !== "") {
      conditions.push(
        `(r.title ILIKE $${paramIndex} OR r.summary ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR r.project_name ILIKE $${paramIndex})`
      );
      values.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        r.*,
        u.name as user_name,
        u.email as user_email,
        u.avatar_color as user_avatar_color,
        u.initials as user_initials,
        d.name as user_department_name,
        roles.name as user_role_name
      FROM work_reports r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN roles ON u.role_id = roles.id
      ${whereClause}
      ORDER BY r.created_at DESC;
    `;

    const { rows } = await db.query(query, values);
    return rows.map((r: any) => this.formatReport(r));
  }

  /**
   * Fetch a single report by ID
   */
  static async getById(id: string, organizationId: string | null, userCtx?: any): Promise<any | null> {
    const conditions = ["r.id = $1"];
    const values: any[] = [id];
    let paramIndex = 2;

    if (organizationId) {
      conditions.push(`r.organization_id = $${paramIndex++}`);
      values.push(organizationId);
    }

    const query = `
      SELECT 
        r.*,
        u.name as user_name,
        u.email as user_email,
        u.avatar_color as user_avatar_color,
        u.initials as user_initials,
        d.name as user_department_name,
        roles.name as user_role_name
      FROM work_reports r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN roles ON u.role_id = roles.id
      WHERE ${conditions.join(" AND ")};
    `;

    const { rows } = await db.query(query, values);
    if (rows.length === 0) return null;

    const report = this.formatReport(rows[0]);

    // Check permissions if regular teammate
    const isAdmin = this.isUserAdmin(userCtx);
    if (!isAdmin && userCtx?.id && report.employee.id !== userCtx.id) {
      return null;
    }

    return report;
  }

  /**
   * Create a new Work Report
   */
  static async create(data: CreateWorkReportInput, organizationId: string | null, user: any): Promise<any> {
    const startDate = data.startDate || data.dateRange?.startDate || "";
    const endDate = data.endDate || data.dateRange?.endDate || "";
    const projectName = data.projectName || data.project || "";

    const isExecutiveAdmin =
      user &&
      (user.is_super_admin ||
        user.isSuperAdmin ||
        (user.role_rank !== undefined && Number(user.role_rank) <= 1) ||
        (user.roleRank !== undefined && Number(user.roleRank) <= 1) ||
        (user.role_name &&
          (user.role_name.toLowerCase() === "admin" ||
            user.role_name.toLowerCase() === "super admin")) ||
        (user.roleName &&
          (user.roleName.toLowerCase() === "admin" ||
            user.roleName.toLowerCase() === "super admin")));

    let finalStatus = data.status || "draft";
    let managerReview = null;

    if (isExecutiveAdmin && finalStatus === "submitted") {
      finalStatus = "approved";
      managerReview = {
        status: "approved",
        reviewerName: user.name || "Executive Leadership",
        reviewerRole: "Executive / Admin",
        comment: "Executive report auto-verified upon publication.",
        reviewedAt: new Date().toISOString(),
      };
    }

    let submittedOn = data.submittedOn || "";
    if ((finalStatus === "submitted" || finalStatus === "approved") && !submittedOn) {
      submittedOn = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    const query = `
      INSERT INTO work_reports (
        organization_id,
        user_id,
        title,
        type,
        period,
        start_date,
        end_date,
        project_id,
        project_name,
        work_category,
        summary,
        tasks,
        achievements,
        challenges,
        challenges_status,
        skills,
        next_goals,
        attachments,
        daily_activities,
        project_breakdowns,
        timeline_milestones,
        yearly_achievements,
        status,
        submitted_on,
        manager_review,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12::jsonb, $13::jsonb, $14, $15, $16::jsonb, $17::jsonb, $18::jsonb,
        $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb, $23, $24, $25::jsonb, NOW(), NOW()
      )
      RETURNING *;
    `;

    const values = [
      organizationId,
      user.id,
      data.title,
      data.type || "weekly",
      data.period,
      startDate,
      endDate,
      data.projectId || null,
      projectName,
      data.workCategory || "Development",
      data.summary || "",
      JSON.stringify(data.tasks || []),
      JSON.stringify(data.achievements || []),
      data.challenges || "",
      data.challengesStatus || "resolved",
      JSON.stringify(data.skills || []),
      JSON.stringify(data.nextGoals || []),
      JSON.stringify(data.attachments || []),
      JSON.stringify(data.dailyActivities || []),
      JSON.stringify(data.projectBreakdowns || []),
      JSON.stringify(data.timelineMilestones || []),
      JSON.stringify(data.yearlyAchievements || []),
      finalStatus,
      submittedOn,
      managerReview ? JSON.stringify(managerReview) : null,
    ];

    const { rows } = await db.query(query, values);
    return await this.getById(rows[0].id, organizationId, user);
  }

  /**
   * Update an existing report
   */
  static async update(
    id: string,
    data: UpdateWorkReportInput,
    organizationId: string | null,
    userCtx: any
  ): Promise<any | null> {
    const existing = await this.getById(id, organizationId, userCtx);
    if (!existing) return null;

    const isAdmin = this.isUserAdmin(userCtx);
    const isOwner = userCtx?.id && existing.employee.id === userCtx.id;

    // Teammates can only edit their own draft or changes_requested reports
    if (!isAdmin && !isOwner) {
      throw new Error("You do not have permission to update this report");
    }

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      values.push(data.title);
    }
    if (data.type !== undefined) {
      setClauses.push(`type = $${paramIndex++}`);
      values.push(data.type);
    }
    if (data.period !== undefined) {
      setClauses.push(`period = $${paramIndex++}`);
      values.push(data.period);
    }
    if (data.startDate !== undefined || data.dateRange?.startDate !== undefined) {
      setClauses.push(`start_date = $${paramIndex++}`);
      values.push(data.startDate || data.dateRange?.startDate || "");
    }
    if (data.endDate !== undefined || data.dateRange?.endDate !== undefined) {
      setClauses.push(`end_date = $${paramIndex++}`);
      values.push(data.endDate || data.dateRange?.endDate || "");
    }
    if (data.projectId !== undefined) {
      setClauses.push(`project_id = $${paramIndex++}`);
      values.push(data.projectId);
    }
    if (data.projectName !== undefined || data.project !== undefined) {
      setClauses.push(`project_name = $${paramIndex++}`);
      values.push(data.projectName || data.project || "");
    }
    if (data.workCategory !== undefined) {
      setClauses.push(`work_category = $${paramIndex++}`);
      values.push(data.workCategory);
    }
    if (data.summary !== undefined) {
      setClauses.push(`summary = $${paramIndex++}`);
      values.push(data.summary);
    }
    if (data.tasks !== undefined) {
      setClauses.push(`tasks = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(data.tasks));
    }
    if (data.achievements !== undefined) {
      setClauses.push(`achievements = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(data.achievements));
    }
    if (data.challenges !== undefined) {
      setClauses.push(`challenges = $${paramIndex++}`);
      values.push(data.challenges);
    }
    if (data.challengesStatus !== undefined) {
      setClauses.push(`challenges_status = $${paramIndex++}`);
      values.push(data.challengesStatus);
    }
    if (data.skills !== undefined) {
      setClauses.push(`skills = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(data.skills));
    }
    if (data.nextGoals !== undefined) {
      setClauses.push(`next_goals = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(data.nextGoals));
    }
    if (data.attachments !== undefined) {
      setClauses.push(`attachments = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(data.attachments));
    }
    if (data.dailyActivities !== undefined) {
      setClauses.push(`daily_activities = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(data.dailyActivities));
    }
    if (data.projectBreakdowns !== undefined) {
      setClauses.push(`project_breakdowns = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(data.projectBreakdowns));
    }
    if (data.timelineMilestones !== undefined) {
      setClauses.push(`timeline_milestones = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(data.timelineMilestones));
    }
    if (data.yearlyAchievements !== undefined) {
      setClauses.push(`yearly_achievements = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(data.yearlyAchievements));
    }

    if (data.status !== undefined) {
      const isExecutiveAdmin =
        userCtx &&
        (userCtx.is_super_admin ||
          userCtx.isSuperAdmin ||
          (userCtx.role_rank !== undefined && Number(userCtx.role_rank) <= 1) ||
          (userCtx.roleRank !== undefined && Number(userCtx.roleRank) <= 1) ||
          (userCtx.role_name &&
            (userCtx.role_name.toLowerCase() === "admin" ||
              userCtx.role_name.toLowerCase() === "super admin")) ||
          (userCtx.roleName &&
            (userCtx.roleName.toLowerCase() === "admin" ||
              userCtx.roleName.toLowerCase() === "super admin")));

      let targetStatus = data.status;
      if (isExecutiveAdmin && targetStatus === "submitted") {
        targetStatus = "approved";
      }

      setClauses.push(`status = $${paramIndex++}`);
      values.push(targetStatus);

      if (targetStatus === "approved" && isExecutiveAdmin) {
        const autoReview = {
          status: "approved",
          reviewerName: userCtx.name || "Executive Leadership",
          reviewerRole: "Executive / Admin",
          comment: "Executive report auto-verified upon publication.",
          reviewedAt: new Date().toISOString(),
        };
        setClauses.push(`manager_review = $${paramIndex++}::jsonb`);
        values.push(JSON.stringify(autoReview));
      } else if (data.status === "submitted") {
        const submittedOn =
          data.submittedOn ||
          new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        setClauses.push(`submitted_on = $${paramIndex++}`);
        values.push(submittedOn);

        // If resubmitting from changes_requested, update manager_review status
        if (existing.status === "changes_requested") {
          const resubmittedReview = {
            status: "submitted",
            reviewerName: existing.managerReview?.reviewerName || "Manager",
            reviewerRole: existing.managerReview?.reviewerRole || "Reviewer",
            comment: "Resubmitted for review.",
            reviewedAt: new Date().toISOString(),
          };
          setClauses.push(`manager_review = $${paramIndex++}::jsonb`);
          values.push(JSON.stringify(resubmittedReview));
        }
      }
    }

    setClauses.push(`updated_at = NOW()`);

    values.push(id);
    const idParam = `$${paramIndex++}`;

    let orgCondition = "";
    if (organizationId) {
      values.push(organizationId);
      orgCondition = `AND organization_id = $${paramIndex++}`;
    }

    const query = `
      UPDATE work_reports
      SET ${setClauses.join(", ")}
      WHERE id = ${idParam} ${orgCondition}
      RETURNING id;
    `;

    const { rows } = await db.query(query, values);
    if (rows.length === 0) return null;

    return await this.getById(id, organizationId, userCtx);
  }

  /**
   * Manager / Admin review (Approve or Request Changes)
   */
  static async review(
    id: string,
    action: "approve" | "request_changes",
    comment: string,
    organizationId: string | null,
    user: any
  ): Promise<any | null> {
    const isAdmin = this.isUserAdmin(user);
    if (!isAdmin) {
      throw new Error("Only managers or administrators can review reports");
    }

    const newStatus = action === "approve" ? "approved" : "changes_requested";
    const managerReview = {
      status: newStatus,
      reviewerName: user.name || "Project Manager",
      reviewerRole: user.role_name || user.roleName || "Manager",
      comment: comment || (action === "approve" ? "Report approved." : "Changes requested."),
      reviewedAt: new Date().toISOString(),
    };

    const conditions = ["id = $1"];
    const values = [id, newStatus, JSON.stringify(managerReview)];
    let paramIndex = 4;

    if (organizationId) {
      conditions.push(`organization_id = $${paramIndex++}`);
      values.push(organizationId);
    }

    const query = `
      UPDATE work_reports
      SET 
        status = $2,
        manager_review = $3::jsonb,
        updated_at = NOW()
      WHERE ${conditions.join(" AND ")}
      RETURNING id;
    `;

    const { rows } = await db.query(query, values);
    if (rows.length === 0) return null;

    return await this.getById(id, organizationId, user);
  }

  /**
   * Delete a report
   */
  static async delete(id: string, organizationId: string | null, userCtx: any): Promise<boolean> {
    const existing = await this.getById(id, organizationId, userCtx);
    if (!existing) return false;

    const isAdmin = this.isUserAdmin(userCtx);
    const isOwner = userCtx?.id && existing.employee.id === userCtx.id;

    if (!isAdmin && !isOwner) {
      throw new Error("You do not have permission to delete this report");
    }

    const conditions = ["id = $1"];
    const values = [id];
    let paramIndex = 2;

    if (organizationId) {
      conditions.push(`organization_id = $${paramIndex++}`);
      values.push(organizationId);
    }

    const query = `
      DELETE FROM work_reports
      WHERE ${conditions.join(" AND ")};
    `;

    const res = await db.query(query, values);
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Aggregate statistics for dashboard summary cards
   */
  static async getDashboardSummary(filters: WorkReportFilters): Promise<any> {
    const reports = await this.getAll(filters);
    const isAdmin = this.isUserAdmin(filters.userCtx) && filters.roleFilter !== "employee";

    if (isAdmin) {
      const employeeSet = new Set<string>();
      let totalSubmittedCount = 0;
      let pendingReviewCount = 0;
      let approvedCount = 0;
      let totalHours = 0;

      reports.forEach((r) => {
        if (r.employee?.id) employeeSet.add(r.employee.id);
        if (r.status === "submitted" || r.status === "approved") {
          totalSubmittedCount++;
        }
        if (r.status === "submitted" || r.status === "changes_requested") {
          pendingReviewCount++;
        }
        if (r.status === "approved") {
          approvedCount++;
        }
        const taskHours = r.tasks?.reduce((s: number, t: any) => s + (Number(t.hours) || 0), 0) || 0;
        totalHours += taskHours;
      });

      return {
        isAdmin: true,
        totalEmployeesCount: employeeSet.size,
        totalSubmittedCount,
        pendingReviewCount,
        approvedCount,
        totalHours,
        totalReportsCount: reports.length,
      };
    } else {
      let submittedCount = 0;
      let pendingCount = 0;
      let totalHours = 0;
      const projectsSet = new Set<string>();

      reports.forEach((r) => {
        if (r.status === "submitted" || r.status === "approved") {
          submittedCount++;
        }
        if (r.status === "submitted" || r.status === "changes_requested") {
          pendingCount++;
        }
        if (r.project) {
          projectsSet.add(r.project);
        }
        const taskHours = r.tasks?.reduce((s: number, t: any) => s + (Number(t.hours) || 0), 0) || 0;
        totalHours += taskHours;
      });

      return {
        isAdmin: false,
        submittedCount,
        pendingCount,
        totalHours,
        activeProjectsCount: projectsSet.size,
        totalReportsCount: reports.length,
      };
    }
  }
}
