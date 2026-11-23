import fs from "fs";
import path from "path";

const collection = {
  info: {
    _postman_id: "collabix-backend-api-collection",
    name: "Collabix API",
    description: "Complete Postman collection for the Collabix backend REST API, covering Authentication, Projects, Tasks, Team Members, Sprints, Meetings, Monitoring, Documentation, Git Repositories, System Settings, and Super Admin Management.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  auth: {
    type: "bearer",
    bearer: [
      {
        key: "token",
        value: "{{accessToken}}",
        type: "string"
      }
    ]
  },
  variable: [
    {
      key: "baseUrl",
      value: "http://localhost:8000",
      type: "string"
    },
    {
      key: "accessToken",
      value: "",
      type: "string"
    },
    {
      key: "projectId",
      value: "project-uuid-placeholder",
      type: "string"
    },
    {
      key: "taskId",
      value: "task-uuid-placeholder",
      type: "string"
    },
    {
      key: "memberId",
      value: "member-uuid-placeholder",
      type: "string"
    },
    {
      key: "sprintId",
      value: "sprint-uuid-placeholder",
      type: "string"
    },
    {
      key: "meetingId",
      value: "meeting-uuid-placeholder",
      type: "string"
    },
    {
      key: "leaveId",
      value: "leave-uuid-placeholder",
      type: "string"
    },
    {
      key: "discussionId",
      value: "discussion-uuid-placeholder",
      type: "string"
    },
    {
      key: "reportId",
      value: "report-uuid-placeholder",
      type: "string"
    },
    {
      key: "repoId",
      value: "repo-uuid-placeholder",
      type: "string"
    },
    {
      key: "ticketId",
      value: "ticket-uuid-placeholder",
      type: "string"
    },
    {
      key: "organizationId",
      value: "org-uuid-placeholder",
      type: "string"
    }
  ],
  item: []
};

// Helper to create request item
function makeReq({ name, method, pathSegments, query = [], body = null, headers = [], auth = null, description = "", testScript = "" }) {
  const urlObj = {
    raw: `{{baseUrl}}/${pathSegments.join("/")}${query.length ? "?" + query.map(q => `${q.key}=${q.value}`).join("&") : ""}`,
    host: ["{{baseUrl}}"],
    path: pathSegments,
    query: query.map(q => ({ key: q.key, value: q.value, description: q.description || "" })),
    variable: pathSegments
      .filter(s => s.startsWith(":"))
      .map(s => ({
        key: s.replace(/^:/, ""),
        value: s.replace(/^:/, "") + "-id",
        description: `URL parameter ${s}`
      }))
  };

  const reqObj = {
    name,
    request: {
      method,
      header: [
        ...(body ? [{ key: "Content-Type", value: "application/json" }] : []),
        ...headers
      ],
      url: urlObj,
      description
    },
    response: []
  };

  if (body) {
    reqObj.request.body = {
      mode: "raw",
      raw: JSON.stringify(body, null, 2),
      options: {
        raw: {
          language: "json"
        }
      }
    };
  }

  if (auth !== null) {
    reqObj.request.auth = auth;
  }

  if (testScript) {
    reqObj.event = [
      {
        listen: "test",
        script: {
          type: "text/javascript",
          exec: testScript.split("\n")
        }
      }
    ];
  }

  return reqObj;
}

// 1. Health
const healthFolder = {
  name: "01. Health & Status",
  item: [
    makeReq({
      name: "Root Health Check",
      method: "GET",
      pathSegments: ["health"],
      auth: { type: "noauth" },
      description: "Checks basic platform availability"
    }),
    makeReq({
      name: "API Health Check",
      method: "GET",
      pathSegments: ["api", "health"],
      auth: { type: "noauth" },
      description: "Checks API subsystem health status and timestamp"
    })
  ]
};

// 2. Authentication
const authFolder = {
  name: "02. Authentication & Session",
  item: [
    makeReq({
      name: "Register Organization & Owner",
      method: "POST",
      pathSegments: ["auth", "register"],
      auth: { type: "noauth" },
      body: {
        companyName: "Acme Corp",
        fullName: "Jane Doe",
        email: "jane.doe@example.com",
        phone: "+1234567890",
        password: "SecurePassword123!"
      },
      description: "Registers a new tenant organization and default owner account."
    }),
    makeReq({
      name: "Login",
      method: "POST",
      pathSegments: ["auth", "login"],
      auth: { type: "noauth" },
      body: {
        email: "jane.doe@example.com",
        password: "SecurePassword123!"
      },
      description: "Authenticates user credentials, sets session cookies, and returns user & permission information.",
      testScript: `// Save accessToken from cookie or response
if (pm.cookies.has("access_token")) {
    const token = pm.cookies.get("access_token");
    pm.collectionVariables.set("accessToken", token);
    pm.environment.set("accessToken", token);
    console.log("Saved access_token to variables from cookie.");
}
const res = pm.response.json();
if (res.user && res.user.organizationId) {
    pm.collectionVariables.set("organizationId", res.user.organizationId);
    pm.environment.set("organizationId", res.user.organizationId);
}
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});`
    }),
    makeReq({
      name: "Get Current Session (Me)",
      method: "GET",
      pathSegments: ["auth", "me"],
      description: "Returns the authenticated user profile, organization info, and granted permissions."
    }),
    makeReq({
      name: "Refresh Token",
      method: "POST",
      pathSegments: ["auth", "refresh"],
      auth: { type: "noauth" },
      description: "Rotates refresh token and returns new session cookies."
    }),
    makeReq({
      name: "Logout",
      method: "POST",
      pathSegments: ["auth", "logout"],
      description: "Revokes refresh token in database and clears session cookies."
    }),
    makeReq({
      name: "Verify Invite Token",
      method: "GET",
      pathSegments: ["auth", "verify-invite"],
      auth: { type: "noauth" },
      query: [{ key: "token", value: "invite_token_here", description: "Email invite token" }],
      description: "Verifies the member invitation token before setting up password."
    }),
    makeReq({
      name: "Setup Password (Invited User)",
      method: "POST",
      pathSegments: ["auth", "setup-password"],
      auth: { type: "noauth" },
      body: {
        token: "invite_token_here",
        password: "NewUserPassword123!"
      },
      description: "Sets the initial password for an invited user and activates their account."
    }),
    makeReq({
      name: "Forgot Password",
      method: "POST",
      pathSegments: ["auth", "forgot-password"],
      auth: { type: "noauth" },
      body: {
        email: "jane.doe@example.com"
      },
      description: "Sends a password reset link to the given registered email address."
    }),
    makeReq({
      name: "Verify Reset Token",
      method: "GET",
      pathSegments: ["auth", "verify-reset-token"],
      auth: { type: "noauth" },
      query: [
        { key: "email", value: "jane.doe@example.com" },
        { key: "token", value: "reset_token_here" }
      ],
      description: "Verifies whether a password reset token is valid and unexpired."
    }),
    makeReq({
      name: "Reset Password",
      method: "POST",
      pathSegments: ["auth", "reset-password"],
      auth: { type: "noauth" },
      body: {
        email: "jane.doe@example.com",
        token: "reset_token_here",
        password: "NewPassword123!"
      },
      description: "Resets user password using the verified reset token."
    })
  ]
};

// 3. User Profile & Security
const userProfileFolder = {
  name: "03. User Profile & Security",
  item: [
    makeReq({
      name: "Update Profile",
      method: "PATCH",
      pathSegments: ["api", "users", "profile"],
      body: {
        name: "Jane Smith",
        email: "jane.smith@example.com"
      },
      description: "Updates current user full name and email address."
    }),
    makeReq({
      name: "Change Password",
      method: "POST",
      pathSegments: ["api", "users", "change-password"],
      body: {
        currentPassword: "CurrentPassword123!",
        newPassword: "BrandNewPassword123!",
        confirmNewPassword: "BrandNewPassword123!"
      },
      description: "Changes current user password securely after validating the old password."
    }),
    makeReq({
      name: "Update Organization Details",
      method: "PATCH",
      pathSegments: ["api", "organization"],
      body: {
        name: "Acme Corporation Inc.",
        timezone: "Asia/Kolkata"
      },
      description: "Updates organization name and timezone (Admin only)."
    })
  ]
};

// 4. Subscription & Billing
const subscriptionFolder = {
  name: "04. Subscription & Billing",
  item: [
    makeReq({
      name: "Get Organization Subscription",
      method: "GET",
      pathSegments: ["api", "subscription"],
      description: "Retrieves active SaaS subscription tier, status, and period info."
    }),
    makeReq({
      name: "Update / Upgrade Subscription Plan",
      method: "POST",
      pathSegments: ["api", "subscription"],
      body: {
        planId: "enterprise",
        billingCycle: "yearly"
      },
      description: "Updates plan tier or creates order for upgraded billing (Admin only)."
    }),
    makeReq({
      name: "Create Subscription Order",
      method: "POST",
      pathSegments: ["api", "subscription", "create-order"],
      body: {
        planId: "pro",
        billingCycle: "monthly"
      },
      description: "Generates Razorpay subscription order for frontend checkout."
    }),
    makeReq({
      name: "Verify Subscription Payment",
      method: "POST",
      pathSegments: ["api", "subscription", "verify"],
      body: {
        razorpayPaymentId: "pay_123456789",
        razorpaySubscriptionId: "sub_123456789",
        razorpaySignature: "signature_hash_here"
      },
      description: "Verifies HMAC signature of completed Razorpay payment."
    }),
    makeReq({
      name: "Cancel Subscription",
      method: "POST",
      pathSegments: ["api", "subscription", "cancel"],
      body: {},
      description: "Cancels active SaaS subscription at the end of the current billing cycle."
    }),
    makeReq({
      name: "Razorpay Webhook Listener",
      method: "POST",
      pathSegments: ["auth", "subscription", "webhook"],
      auth: { type: "noauth" },
      headers: [
        { key: "x-razorpay-signature", value: "webhook_signature_header_value" }
      ],
      body: {
        event: "subscription.charged",
        payload: {}
      },
      description: "Raw webhook receiver invoked by Razorpay server for automated renewal processing."
    })
  ]
};

// 5. Projects
const projectsFolder = {
  name: "05. Projects",
  item: [
    makeReq({
      name: "List All Projects",
      method: "GET",
      pathSegments: ["api", "projects"],
      description: "Returns all projects accessible to the current user's role."
    }),
    makeReq({
      name: "Get Project by ID",
      method: "GET",
      pathSegments: ["api", "projects", ":id"],
      description: "Returns detailed project attributes, members, and progress metrics."
    }),
    makeReq({
      name: "Create Project",
      method: "POST",
      pathSegments: ["api", "projects"],
      body: {
        name: "Mobile App Redesign",
        description: "Redesigning the iOS and Android application UI/UX.",
        status: "active",
        dueDate: "2026-12-31",
        color: "#4F46E5",
        memberIds: []
      },
      description: "Creates a new workspace project."
    }),
    makeReq({
      name: "Update Project",
      method: "PATCH",
      pathSegments: ["api", "projects", ":id"],
      body: {
        name: "Mobile App Redesign v2",
        status: "active",
        progress: 45,
        dueDate: "2027-01-31"
      },
      description: "Updates project attributes or status."
    }),
    makeReq({
      name: "Delete Project",
      method: "DELETE",
      pathSegments: ["api", "projects", ":id"],
      description: "Deletes a project and related records (Admin only)."
    })
  ]
};

// 6. Tasks
const tasksFolder = {
  name: "06. Tasks",
  item: [
    makeReq({
      name: "List Tasks",
      method: "GET",
      pathSegments: ["api", "tasks"],
      description: "Fetches tasks filtered by tenant and user role."
    }),
    makeReq({
      name: "List Tasks by Project",
      method: "GET",
      pathSegments: ["api", "tasks"],
      query: [{ key: "projectId", value: "{{projectId}}" }],
      description: "Filters tasks belonging to a specific project."
    }),
    makeReq({
      name: "Get Task by ID",
      method: "GET",
      pathSegments: ["api", "tasks", ":id"],
      description: "Retrieves full task details, assignees, and attachments."
    }),
    makeReq({
      name: "Create Task",
      method: "POST",
      pathSegments: ["api", "tasks"],
      body: {
        title: "Implement OAuth2 Authentication",
        description: "Add GitHub and Google OAuth2 integration with secure callback handling.",
        status: "todo",
        priority: "high",
        assigneeId: "{{memberId}}",
        projectId: "{{projectId}}",
        dueDate: "2026-11-15",
        startDate: "2026-11-01"
      },
      description: "Creates a new task in the specified project."
    }),
    makeReq({
      name: "Update Task",
      method: "PATCH",
      pathSegments: ["api", "tasks", ":id"],
      body: {
        status: "in_progress",
        priority: "urgent",
        description: "Updated description with latest API specs."
      },
      description: "Updates task status, priority, due date, or assignees."
    }),
    makeReq({
      name: "Delete Task",
      method: "DELETE",
      pathSegments: ["api", "tasks", ":id"],
      description: "Deletes task by ID."
    }),
    makeReq({
      name: "Get Task Git Development Activity",
      method: "GET",
      pathSegments: ["api", "tasks", ":taskId", "development"],
      description: "Returns connected git commits and pull request branches linked to this task."
    })
  ]
};

// 7. Team & RBAC
const teamFolder = {
  name: "07. Team Members & RBAC",
  item: [
    makeReq({
      name: "List Team Members",
      method: "GET",
      pathSegments: ["api", "team"],
      description: "Lists all team members in the organization."
    }),
    makeReq({
      name: "List Team Members (Filtered by Date Range)",
      method: "GET",
      pathSegments: ["api", "team"],
      query: [
        { key: "startDate", value: "2026-01-01" },
        { key: "endDate", value: "2026-12-31" }
      ],
      description: "Lists members with calculated worked hours across the given date range."
    }),
    makeReq({
      name: "Get Member by ID",
      method: "GET",
      pathSegments: ["api", "team", ":id"],
      description: "Gets detailed profile and activity metrics for a specific member."
    }),
    makeReq({
      name: "Create Member Directly",
      method: "POST",
      pathSegments: ["api", "team"],
      body: {
        name: "Alex Rivera",
        role: "Teammates",
        email: "alex.rivera@example.com",
        avatarColor: "#10B981",
        initials: "AR"
      },
      description: "Creates a team member record directly."
    }),
    makeReq({
      name: "Invite Member via Email",
      method: "POST",
      pathSegments: ["api", "team", "invite"],
      body: {
        name: "Sarah Connor",
        email: "sarah.connor@example.com",
        roleId: "uuid-of-role",
        role: "Teammates",
        departmentId: null,
        projectId: null
      },
      description: "Sends an email invite with an onboarding token (Admin only)."
    }),
    makeReq({
      name: "Update Member Role",
      method: "PATCH",
      pathSegments: ["api", "team", ":id"],
      body: {
        role: "Manager"
      },
      description: "Updates role of a team member (Admin/Manager hierarchy check enforced)."
    }),
    makeReq({
      name: "Update Member Position / Designation",
      method: "PATCH",
      pathSegments: ["api", "team", ":id", "position"],
      body: {
        designation: "Senior Full Stack Engineer"
      },
      description: "Updates job title or position."
    }),
    makeReq({
      name: "Update Member Department",
      method: "PATCH",
      pathSegments: ["api", "team", ":id", "department"],
      body: {
        departmentId: "department-uuid-here"
      },
      description: "Assigns member to a department."
    }),
    makeReq({
      name: "Update Task Creation Rights",
      method: "PATCH",
      pathSegments: ["api", "team", ":id", "task-rights"],
      body: {
        canCreateTasks: true
      },
      description: "Grants or revokes permission for teammates to create tasks."
    }),
    makeReq({
      name: "Delete Member",
      method: "DELETE",
      pathSegments: ["api", "team", ":id"],
      description: "Removes member from tenant organization."
    }),
    makeReq({
      name: "List Roles",
      method: "GET",
      pathSegments: ["api", "roles"],
      description: "Returns platform roles (Admin, Manager, Team leader, Teammates, etc.)."
    }),
    makeReq({
      name: "List Departments",
      method: "GET",
      pathSegments: ["api", "departments"],
      description: "Returns organizational departments (Engineering, Design, Marketing, Sales, etc.)."
    })
  ]
};

// 8. Discussions
const discussionsFolder = {
  name: "08. Discussions",
  item: [
    makeReq({
      name: "List Project Discussions",
      method: "GET",
      pathSegments: ["api", "projects", ":projectId", "discussions"],
      description: "Retrieves all discussion threads for a project."
    }),
    makeReq({
      name: "Create Discussion Topic",
      method: "POST",
      pathSegments: ["api", "projects", ":projectId", "discussions"],
      body: {
        type: "discussion",
        priority: "medium",
        title: "API Gateway Architecture Decision",
        description: "Should we migrate routing to Envoy or stay on Express reverse proxy?",
        assignedTo: "{{memberId}}",
        attachments: []
      },
      description: "Starts a new discussion topic or issue."
    }),
    makeReq({
      name: "Get Discussion Replies",
      method: "GET",
      pathSegments: ["api", "discussions", ":discussionId", "replies"],
      description: "Retrieves chronological comments/replies in a discussion thread."
    }),
    makeReq({
      name: "Add Reply to Discussion",
      method: "POST",
      pathSegments: ["api", "discussions", ":discussionId", "replies"],
      body: {
        content: "I recommend staying on Express for Phase 1 to minimize DevOps complexity.",
        attachments: []
      },
      description: "Adds a reply to the specified discussion."
    }),
    makeReq({
      name: "Toggle Resolve Discussion",
      method: "PATCH",
      pathSegments: ["api", "discussions", ":id", "resolve"],
      description: "Marks discussion as resolved or re-opens it."
    }),
    makeReq({
      name: "Delete Discussion",
      method: "DELETE",
      pathSegments: ["api", "discussions", ":id"],
      description: "Deletes a discussion thread."
    })
  ]
};

// 9. Sprints
const sprintsFolder = {
  name: "09. Sprints",
  item: [
    makeReq({
      name: "List Sprints",
      method: "GET",
      pathSegments: ["api", "sprints"],
      query: [{ key: "projectId", value: "{{projectId}}" }],
      description: "Fetches sprints for a project."
    }),
    makeReq({
      name: "Create Sprint",
      method: "POST",
      pathSegments: ["api", "sprints"],
      body: {
        projectId: "{{projectId}}",
        name: "Sprint 24 - Core Feature Launch",
        startDate: "2026-11-01",
        endDate: "2026-11-15"
      },
      description: "Creates an agile sprint milestone."
    }),
    makeReq({
      name: "Update Sprint",
      method: "PATCH",
      pathSegments: ["api", "sprints", ":id"],
      body: {
        name: "Sprint 24 - Extended",
        endDate: "2026-11-20"
      },
      description: "Updates sprint title or dates."
    }),
    makeReq({
      name: "Delete Sprint",
      method: "DELETE",
      pathSegments: ["api", "sprints", ":id"],
      description: "Deletes sprint record (Admin only)."
    })
  ]
};

// 10. Meetings
const meetingsFolder = {
  name: "10. Meetings & Video Sync",
  item: [
    makeReq({
      name: "List Meetings",
      method: "GET",
      pathSegments: ["api", "meetings"],
      query: [
        { key: "tab", value: "upcoming" },
        { key: "team", value: "Engineering" },
        { key: "status", value: "upcoming" }
      ],
      description: "Lists scheduled and past meetings with optional filters."
    }),
    makeReq({
      name: "Get Meeting by ID",
      method: "GET",
      pathSegments: ["api", "meetings", ":id"],
      description: "Fetches details of a specific meeting."
    }),
    makeReq({
      name: "Schedule Meeting",
      method: "POST",
      pathSegments: ["api", "meetings"],
      body: {
        title: "Sprint Planning Sync",
        projectId: "{{projectId}}",
        platform: "teams",
        meetingLink: "https://teams.microsoft.com/l/meetup-join/sample",
        meetingCode: "MS-789-432",
        passcode: "123456",
        teamDepartment: "Engineering",
        description: "Bi-weekly sprint planning and backlog grooming.",
        agenda: ["Review previous sprint metrics", "Assign high priority tickets"],
        date: "2026-11-03",
        startTime: "10:00",
        endTime: "11:00",
        durationMinutes: 60,
        timezone: "Asia/Kolkata",
        status: "upcoming",
        attendees: ["Jane Doe", "Alex Rivera"]
      },
      description: "Schedules a new meeting."
    }),
    makeReq({
      name: "Start Instant Meeting",
      method: "POST",
      pathSegments: ["api", "meetings", "instant"],
      body: {
        title: "Emergency Incident Huddle",
        teamDepartment: "DevOps",
        attendees: ["Jane Doe"]
      },
      description: "Creates and starts an immediate live sync meeting."
    }),
    makeReq({
      name: "Update Meeting",
      method: "PATCH",
      pathSegments: ["api", "meetings", ":id"],
      body: {
        status: "completed",
        notes: "Discussed database replication and resolved action items."
      },
      description: "Updates meeting status, recording link, or notes."
    }),
    makeReq({
      name: "Delete Meeting",
      method: "DELETE",
      pathSegments: ["api", "meetings", ":id"],
      description: "Cancels and removes a meeting."
    }),
    makeReq({
      name: "Get Meeting Chat Messages",
      method: "GET",
      pathSegments: ["api", "meetings", ":id", "messages"],
      description: "Retrieves live chat messages sent during the meeting."
    }),
    makeReq({
      name: "Send Meeting Chat Message",
      method: "POST",
      pathSegments: ["api", "meetings", ":id", "messages"],
      body: {
        message: "Here is the link to the sprint board: https://app.collabix.com/sprints"
      },
      description: "Sends a chat message in the meeting channel."
    })
  ]
};

// 11. Leaves & Activity
const leavesFolder = {
  name: "11. Leaves & Activity Feed",
  item: [
    makeReq({
      name: "List Leaves",
      method: "GET",
      pathSegments: ["api", "leaves"],
      query: [{ key: "memberId", value: "{{memberId}}" }],
      description: "Retrieves leave applications."
    }),
    makeReq({
      name: "Apply for Leave",
      method: "POST",
      pathSegments: ["api", "leaves"],
      body: {
        memberId: "{{memberId}}",
        type: "sick",
        startDate: "2026-11-10",
        endDate: "2026-11-12",
        reason: "Viral fever recovery"
      },
      description: "Submits a leave application (Teammates can only apply for themselves)."
    }),
    makeReq({
      name: "Update Leave Status",
      method: "PATCH",
      pathSegments: ["api", "leaves", ":id", "status"],
      body: {
        status: "approved"
      },
      description: "Approves or rejects a leave application (Admin / Manager only)."
    }),
    makeReq({
      name: "Cancel / Delete Leave",
      method: "DELETE",
      pathSegments: ["api", "leaves", ":id"],
      description: "Cancels a leave application."
    }),
    makeReq({
      name: "Get Recent Activity Feed",
      method: "GET",
      pathSegments: ["api", "activity"],
      description: "Fetches organization audit activity log stream."
    })
  ]
};

// 12. Documentation Reports
const reportsFolder = {
  name: "12. Work Documentation Reports",
  item: [
    makeReq({
      name: "List Work Reports",
      method: "GET",
      pathSegments: ["api", "documentation", "reports"],
      description: "Lists weekly, monthly, and annual work documentation reports."
    }),
    makeReq({
      name: "Get Reports Summary Metrics",
      method: "GET",
      pathSegments: ["api", "documentation", "reports", "summary"],
      description: "Returns summary counts and status breakdowns for team reports."
    }),
    makeReq({
      name: "Get Work Report by ID",
      method: "GET",
      pathSegments: ["api", "documentation", "reports", ":id"],
      description: "Fetches detailed work report including daily tasks, milestones, and achievements."
    }),
    makeReq({
      name: "Create Work Report",
      method: "POST",
      pathSegments: ["api", "documentation", "reports"],
      body: {
        title: "Weekly Engineering Report - W44",
        type: "weekly",
        period: "Week 44 (Oct 26 - Nov 01, 2026)",
        startDate: "2026-10-26",
        endDate: "2026-11-01",
        project: "API Collabix",
        projectId: "{{projectId}}",
        workCategory: "Development",
        summary: "Completed migration to PostgreSQL connection pool and added Postman specs.",
        tasks: [
          {
            title: "Setup Postman Collection Generation",
            project: "API Collabix",
            status: "completed",
            hours: 12,
            priority: "high"
          }
        ],
        achievements: ["Zero-downtime database migration", "100% test pass rate"],
        challenges: "CORS issues with third-party webhooks resolved.",
        challengesStatus: "resolved",
        skills: ["Node.js", "Express", "TypeScript", "PostgreSQL"],
        nextGoals: ["Deploy to production staging environment"],
        status: "submitted"
      },
      description: "Creates and submits a weekly/monthly/yearly work documentation report."
    }),
    makeReq({
      name: "Update Work Report",
      method: "PATCH",
      pathSegments: ["api", "documentation", "reports", ":id"],
      body: {
        summary: "Updated summary with final sprint deliverables.",
        status: "submitted"
      },
      description: "Edits a work report."
    }),
    makeReq({
      name: "Review Work Report",
      method: "POST",
      pathSegments: ["api", "documentation", "reports", ":id", "review"],
      body: {
        action: "approve",
        comment: "Excellent work on resolving the webhook issues!"
      },
      description: "Approves or requests changes on a submitted work report."
    }),
    makeReq({
      name: "Delete Work Report",
      method: "DELETE",
      pathSegments: ["api", "documentation", "reports", ":id"],
      description: "Deletes a work report."
    })
  ]
};

// 13. Screen Monitoring
const monitoringFolder = {
  name: "13. Screen Monitoring & Time Tracking",
  item: [
    makeReq({
      name: "Start Monitoring",
      method: "POST",
      pathSegments: ["api", "monitoring", "start"],
      body: {},
      description: "Anchors clock-in start time for today's workday."
    }),
    makeReq({
      name: "Stop Monitoring",
      method: "POST",
      pathSegments: ["api", "monitoring", "stop"],
      body: {},
      description: "Stops active monitoring workday session."
    }),
    makeReq({
      name: "Start Monitoring Session",
      method: "POST",
      pathSegments: ["api", "monitoring", "session", "start"],
      body: {
        device_uuid: "desktop-app-uuid-987"
      },
      description: "Registers active desktop tracking session and returns organization screenshot interval rules."
    }),
    makeReq({
      name: "Stop Monitoring Session",
      method: "POST",
      pathSegments: ["api", "monitoring", "session", "stop"],
      body: {
        session_id: "sess-123456789"
      },
      description: "Closes the desktop tracking session."
    }),
    makeReq({
      name: "Send Session Heartbeat",
      method: "POST",
      pathSegments: ["api", "monitoring", "session", "heartbeat"],
      body: {
        session_id: "sess-123456789",
        active_app: "Visual Studio Code",
        active_domain: "github.com",
        window_title: "app.ts - api-collabix"
      },
      description: "Periodic heartbeat from desktop client recording active window title and application."
    }),
    {
      name: "Upload Screenshot (Multipart)",
      request: {
        method: "POST",
        header: [],
        body: {
          mode: "formdata",
          formdata: [
            {
              key: "screenshot",
              type: "file",
              description: "Binary image file (JPEG/PNG)"
            },
            {
              key: "status",
              value: "active",
              type: "text",
              description: "active or inactive"
            },
            {
              key: "captured_at",
              value: new Date().toISOString(),
              type: "text"
            }
          ]
        },
        url: {
          raw: "{{baseUrl}}/api/monitoring/upload",
          host: ["{{baseUrl}}"],
          path: ["api", "monitoring", "upload"]
        },
        description: "Uploads captured screenshot and logs duration worked."
      },
      response: []
    },
    makeReq({
      name: "List Captured Screenshots",
      method: "GET",
      pathSegments: ["api", "monitoring", "screenshots"],
      query: [
        { key: "userId", value: "{{memberId}}" },
        { key: "startDate", value: "2026-10-01" },
        { key: "endDate", value: "2026-10-31" },
        { key: "limit", value: "50" }
      ],
      description: "Fetches screenshots for timesheet inspection."
    }),
    makeReq({
      name: "Delete Screenshot",
      method: "DELETE",
      pathSegments: ["api", "monitoring", "screenshots", ":id"],
      description: "Soft deletes a screenshot while preserving logged work hours."
    }),
    makeReq({
      name: "Start Lunch Break",
      method: "POST",
      pathSegments: ["api", "monitoring", "lunch", "start"],
      body: {},
      description: "Pauses active work and marks beginning of lunch break."
    }),
    makeReq({
      name: "Stop Lunch Break",
      method: "POST",
      pathSegments: ["api", "monitoring", "lunch", "stop"],
      body: {},
      description: "Resumes working time and records lunch break duration."
    })
  ]
};

// 14. File Uploads
const uploadFolder = {
  name: "14. File Uploads & Storage",
  item: [
    {
      name: "Upload Attachment (Multipart)",
      request: {
        method: "POST",
        header: [],
        body: {
          mode: "formdata",
          formdata: [
            {
              key: "file",
              type: "file",
              description: "File to upload (Cloudflare R2 or local disk storage)"
            }
          ]
        },
        url: {
          raw: "{{baseUrl}}/api/upload/attachment",
          host: ["{{baseUrl}}"],
          path: ["api", "upload", "attachment"]
        },
        description: "Uploads document or attachment up to 50MB."
      },
      response: []
    },
    makeReq({
      name: "Stream / Download Uploaded File",
      method: "GET",
      pathSegments: ["api", "upload", "file", "attachments", "sample-file.pdf"],
      query: [{ key: "download", value: "false" }],
      description: "Streams or downloads stored file from Cloudflare R2 / disk."
    })
  ]
};

// 15. Git & Repositories
const gitFolder = {
  name: "15. Git Repositories & GitHub Integration",
  item: [
    makeReq({
      name: "List Repositories",
      method: "GET",
      pathSegments: ["api", "repositories"],
      query: [{ key: "projectId", value: "{{projectId}}" }],
      description: "Lists connected git repositories."
    }),
    makeReq({
      name: "Create / Connect Repository",
      method: "POST",
      pathSegments: ["api", "repositories"],
      body: {
        name: "collabix-frontend",
        projectId: "{{projectId}}",
        defaultBranch: "main",
        visibility: "private",
        repoUrl: "https://github.com/org/collabix-frontend",
        description: "React client SPA for Collabix platform",
        githubOwner: "org",
        githubRepoName: "collabix-frontend"
      },
      description: "Connects a repository to a project."
    }),
    makeReq({
      name: "Get Repository Dashboard",
      method: "GET",
      pathSegments: ["api", "repositories", ":id", "dashboard"],
      query: [{ key: "branch", value: "main" }],
      description: "Returns repository statistics, commit history, branch count, and latest activity."
    }),
    makeReq({
      name: "List Branches",
      method: "GET",
      pathSegments: ["api", "repositories", ":id", "branches"],
      description: "Fetches branches."
    }),
    makeReq({
      name: "Create Branch",
      method: "POST",
      pathSegments: ["api", "repositories", ":repoId", "branches"],
      body: {
        name: "feature/postman-collection",
        targetBranch: "main"
      },
      description: "Creates a new git branch."
    }),
    makeReq({
      name: "List Commits",
      method: "GET",
      pathSegments: ["api", "repositories", ":id", "commits"],
      description: "Fetches commits."
    }),
    makeReq({
      name: "Record Commit",
      method: "POST",
      pathSegments: ["api", "repositories", "commits"],
      body: {
        repoId: "{{repoId}}",
        commitHash: "a1b2c3d4e5f6",
        message: "feat: add postman collection generator",
        authorName: "Jane Doe",
        branch: "main",
        taskId: "{{taskId}}"
      },
      description: "Records a git commit linked to a task."
    }),
    makeReq({
      name: "List Pull Requests",
      method: "GET",
      pathSegments: ["api", "repositories", ":repoId", "pull-requests"],
      description: "Fetches repository pull requests."
    }),
    makeReq({
      name: "Create Pull Request",
      method: "POST",
      pathSegments: ["api", "repositories", ":repoId", "pull-requests"],
      body: {
        title: "feat(api): add postman collection",
        sourceBranch: "feature/postman-collection",
        targetBranch: "main",
        taskId: "{{taskId}}",
        description: "Generates comprehensive Postman collection for all routes."
      },
      description: "Creates pull request in repository."
    }),
    makeReq({
      name: "Get Repository Activity",
      method: "GET",
      pathSegments: ["api", "repositories", ":repoId", "activity"],
      description: "Fetches repository commit & PR activity."
    }),
    makeReq({
      name: "List Files in Repo",
      method: "GET",
      pathSegments: ["api", "repositories", ":repoId", "files"],
      description: "Lists repository tree files."
    }),
    makeReq({
      name: "Get File Content",
      method: "GET",
      pathSegments: ["api", "repositories", ":repoId", "file-content"],
      query: [{ key: "path", value: "package.json" }],
      description: "Reads raw content of a file in the repository."
    }),
    makeReq({
      name: "Get Repo README",
      method: "GET",
      pathSegments: ["api", "repositories", ":repoId", "readme"],
      description: "Fetches rendered or raw README."
    }),
    makeReq({
      name: "Sync Repository with Remote",
      method: "POST",
      pathSegments: ["api", "repositories", ":repoId", "sync"],
      body: {},
      description: "Triggers immediate sync with GitHub remote."
    }),
    makeReq({
      name: "Delete Repository",
      method: "DELETE",
      pathSegments: ["api", "repositories", ":repoId"],
      description: "Disconnects repository from Collabix."
    }),
    makeReq({
      name: "Get GitHub OAuth URL",
      method: "GET",
      pathSegments: ["api", "github", "auth-url"],
      description: "Generates GitHub OAuth authorization URL."
    }),
    makeReq({
      name: "GitHub OAuth Callback",
      method: "GET",
      pathSegments: ["api", "github", "callback"],
      query: [{ key: "code", value: "sample_github_oauth_code" }],
      description: "Exchanges code for GitHub personal token."
    }),
    makeReq({
      name: "List User GitHub Repositories",
      method: "GET",
      pathSegments: ["api", "github", "repos"],
      description: "Fetches repositories from connected user GitHub account."
    }),
    makeReq({
      name: "Disconnect GitHub Account",
      method: "POST",
      pathSegments: ["api", "github", "disconnect"],
      body: {},
      description: "Disconnects GitHub OAuth token from user profile."
    }),
    makeReq({
      name: "GitHub Webhook Listener",
      method: "POST",
      pathSegments: ["api", "github", "webhook"],
      auth: { type: "noauth" },
      body: {
        ref: "refs/heads/main",
        commits: []
      },
      description: "Receives push and PR events directly from GitHub Webhooks."
    })
  ]
};

// 16. System Settings
const settingsFolder = {
  name: "16. System Settings (SMTP & WhatsApp)",
  item: [
    makeReq({
      name: "Get SMTP Settings",
      method: "GET",
      pathSegments: ["api", "system", "smtp"],
      description: "Gets current SMTP credentials and configuration (Admin only)."
    }),
    makeReq({
      name: "Update SMTP Settings",
      method: "PATCH",
      pathSegments: ["api", "system", "smtp"],
      body: {
        provider: "Hostinger SMTP",
        encryption: "SSL",
        host: "smtp.hostinger.com",
        port: 465,
        username: "alerts@yourdomain.com",
        password: "SecretSmtpPassword123!",
        fromName: "Collabix Alerts",
        fromEmail: "alerts@yourdomain.com",
        replyTo: "support@yourdomain.com",
        testRecipient: "admin@yourdomain.com"
      },
      description: "Saves custom SMTP email configuration."
    }),
    makeReq({
      name: "Test SMTP Connection",
      method: "POST",
      pathSegments: ["api", "system", "smtp", "test"],
      body: {
        testRecipient: "admin@yourdomain.com"
      },
      description: "Sends a test email to verify SMTP configuration."
    }),
    makeReq({
      name: "Delete SMTP Settings",
      method: "DELETE",
      pathSegments: ["api", "system", "smtp"],
      description: "Resets SMTP configuration to platform defaults."
    }),
    makeReq({
      name: "Get WhatsApp Settings",
      method: "GET",
      pathSegments: ["api", "system", "whatsapp"],
      description: "Fetches WhatsApp notification credentials."
    }),
    makeReq({
      name: "Update WhatsApp Settings",
      method: "PATCH",
      pathSegments: ["api", "system", "whatsapp"],
      body: {
        enabled: true,
        phoneNumber: "+1234567890",
        apiKey: "whatsapp_cloud_api_key_here"
      },
      description: "Updates WhatsApp integration settings."
    }),
    makeReq({
      name: "Delete WhatsApp Settings",
      method: "DELETE",
      pathSegments: ["api", "system", "whatsapp"],
      description: "Clears WhatsApp integration settings."
    })
  ]
};

// 17. Tenant Support
const supportFolder = {
  name: "17. Tenant Help & Support",
  item: [
    makeReq({
      name: "List Support Tickets",
      method: "GET",
      pathSegments: ["api", "support", "tickets"],
      description: "Retrieves support tickets opened by the current organization."
    }),
    makeReq({
      name: "Create Support Ticket",
      method: "POST",
      pathSegments: ["api", "support", "tickets"],
      body: {
        title: "Question regarding billing invoice",
        description: "We upgraded our plan yesterday and need the GST tax invoice.",
        priority: "high"
      },
      description: "Opens a new customer support ticket."
    }),
    makeReq({
      name: "Get Ticket Replies",
      method: "GET",
      pathSegments: ["api", "support", "tickets", ":id", "replies"],
      description: "Fetches reply thread for a support ticket."
    }),
    makeReq({
      name: "Add Reply to Support Ticket",
      method: "POST",
      pathSegments: ["api", "support", "tickets", ":id", "replies"],
      body: {
        message: "Thank you for the quick response. Here is the transaction ID: tx_12345."
      },
      description: "Posts a reply message in the ticket conversation."
    })
  ]
};

// 18. Super Admin Management
const superFolder = {
  name: "18. Super Admin Management",
  item: [
    makeReq({
      name: "List All Organizations",
      method: "GET",
      pathSegments: ["api", "super", "organizations"],
      description: "Lists all tenant organizations on the platform (Super Admin only)."
    }),
    makeReq({
      name: "Create Organization",
      method: "POST",
      pathSegments: ["api", "super", "organizations"],
      body: {
        name: "Delta Innovations",
        ownerEmail: "owner@deltainno.com",
        phone: "+1987654321",
        plan: "Enterprise"
      },
      description: "Provision a new tenant organization."
    }),
    makeReq({
      name: "Update Organization",
      method: "PATCH",
      pathSegments: ["api", "super", "organizations", ":id"],
      body: {
        name: "Delta Innovations Ltd",
        subscriptionStatus: "active",
        plan: "Enterprise",
        isApproved: true
      },
      description: "Updates organization status or approved flag."
    }),
    makeReq({
      name: "Change Organization Plan Tier",
      method: "PATCH",
      pathSegments: ["api", "super", "organizations", ":id", "plan"],
      body: {
        plan: "Enterprise"
      },
      description: "Updates plan tier directly."
    }),
    makeReq({
      name: "Approve Organization",
      method: "POST",
      pathSegments: ["api", "super", "organizations", ":id", "approve"],
      body: {},
      description: "Approves a pending tenant organization."
    }),
    makeReq({
      name: "Revoke Organization Access",
      method: "POST",
      pathSegments: ["api", "super", "organizations", ":id", "revoke"],
      body: {},
      description: "Revokes tenant organization access immediately."
    }),
    makeReq({
      name: "Delete Organization",
      method: "DELETE",
      pathSegments: ["api", "super", "organizations", ":id"],
      description: "Permanently deletes an organization."
    }),
    makeReq({
      name: "Impersonate Organization Admin",
      method: "POST",
      pathSegments: ["api", "super", "organizations", ":id", "impersonate"],
      body: {},
      description: "Generates an impersonation session token as the tenant's admin."
    }),
    makeReq({
      name: "List Platform Users",
      method: "GET",
      pathSegments: ["api", "super", "users"],
      description: "Lists all users across all tenants."
    }),
    makeReq({
      name: "Update Platform User Role",
      method: "PATCH",
      pathSegments: ["api", "super", "users", ":id", "role"],
      body: {
        roleId: "new-role-uuid"
      },
      description: "Super Admin update user role."
    }),
    makeReq({
      name: "Update Platform User Status",
      method: "PATCH",
      pathSegments: ["api", "super", "users", ":id", "status"],
      body: {
        status: "SUSPENDED"
      },
      description: "Suspends or activates a user account across the platform."
    }),
    makeReq({
      name: "Delete Platform User",
      method: "DELETE",
      pathSegments: ["api", "super", "users", ":id"],
      description: "Deletes a platform user."
    }),
    makeReq({
      name: "Get System Audit Logs",
      method: "GET",
      pathSegments: ["api", "super", "logs"],
      description: "Retrieves global platform audit logs."
    }),
    makeReq({
      name: "Get Feature Flags",
      method: "GET",
      pathSegments: ["api", "super", "flags"],
      description: "Retrieves global feature toggle flags."
    }),
    makeReq({
      name: "Toggle Feature Flag",
      method: "PATCH",
      pathSegments: ["api", "super", "flags", ":id"],
      body: {
        enabled: true
      },
      description: "Toggles a platform feature flag."
    }),
    makeReq({
      name: "Get Security Policies",
      method: "GET",
      pathSegments: ["api", "super", "security"],
      description: "Gets platform security policies (e.g. 2FA enforcement, IP whitelists)."
    }),
    makeReq({
      name: "Toggle Security Policy",
      method: "PATCH",
      pathSegments: ["api", "super", "security", ":id"],
      body: {
        enabled: true
      },
      description: "Enforces or relaxes a platform security policy."
    }),
    makeReq({
      name: "Get Platform Settings",
      method: "GET",
      pathSegments: ["api", "super", "settings"],
      description: "Gets platform-wide settings (maintenance mode, registration rules, etc.)."
    }),
    makeReq({
      name: "Update Platform Settings",
      method: "PATCH",
      pathSegments: ["api", "super", "settings"],
      body: {
        maintenanceMode: false,
        allowRegistration: true
      },
      description: "Updates platform maintenance mode or global parameters."
    }),
    makeReq({
      name: "Generate Super Admin API Key",
      method: "POST",
      pathSegments: ["api", "super", "settings", "keys", "generate"],
      body: {
        name: "CI/CD Deployment Service Key"
      },
      description: "Creates a machine-to-machine API key."
    }),
    makeReq({
      name: "Revoke Super Admin API Key",
      method: "POST",
      pathSegments: ["api", "super", "settings", "keys", "revoke"],
      body: {
        keyId: "api-key-uuid-here"
      },
      description: "Revokes a machine-to-machine API key."
    }),
    makeReq({
      name: "List Super Admin Support Tickets",
      method: "GET",
      pathSegments: ["api", "super", "tickets"],
      description: "Lists all tickets from all tenant organizations."
    }),
    makeReq({
      name: "Update Support Ticket Status",
      method: "PATCH",
      pathSegments: ["api", "super", "tickets", ":id"],
      body: {
        status: "resolved",
        priority: "medium"
      },
      description: "Updates ticket lifecycle state."
    }),
    makeReq({
      name: "Reply to Support Ticket as Platform Admin",
      method: "POST",
      pathSegments: ["api", "super", "tickets", ":id", "replies"],
      body: {
        message: "Your invoice has been regenerated and sent to your billing email."
      },
      description: "Sends an administrative response to a tenant support ticket."
    }),
    makeReq({
      name: "List Invoices",
      method: "GET",
      pathSegments: ["api", "super", "invoices"],
      description: "Lists billing invoices across tenants."
    }),
    makeReq({
      name: "Create Manual Invoice",
      method: "POST",
      pathSegments: ["api", "super", "invoices"],
      body: {
        organizationId: "{{organizationId}}",
        amount: 4999,
        currency: "INR",
        description: "Custom Enterprise Add-on"
      },
      description: "Generates custom billing invoice."
    }),
    makeReq({
      name: "Download Invoice PDF",
      method: "GET",
      pathSegments: ["api", "super", "invoices", ":id", "pdf"],
      description: "Downloads rendered invoice PDF."
    })
  ]
};

collection.item = [
  healthFolder,
  authFolder,
  userProfileFolder,
  subscriptionFolder,
  projectsFolder,
  tasksFolder,
  teamFolder,
  discussionsFolder,
  sprintsFolder,
  meetingsFolder,
  leavesFolder,
  reportsFolder,
  monitoringFolder,
  uploadFolder,
  gitFolder,
  settingsFolder,
  supportFolder,
  superFolder
];

// Write Postman Collection file
fs.writeFileSync("collabix-api.postman_collection.json", JSON.stringify(collection, null, 2), "utf8");
console.log("Successfully wrote collabix-api.postman_collection.json");

// Create Postman Environment file
const environment = {
  id: "collabix-local-environment",
  name: "Collabix Local Environment",
  values: [
    {
      key: "baseUrl",
      value: "http://localhost:8000",
      type: "default",
      enabled: true
    },
    {
      key: "accessToken",
      value: "",
      type: "secret",
      enabled: true
    },
    {
      key: "projectId",
      value: "",
      type: "default",
      enabled: true
    },
    {
      key: "taskId",
      value: "",
      type: "default",
      enabled: true
    },
    {
      key: "memberId",
      value: "",
      type: "default",
      enabled: true
    },
    {
      key: "sprintId",
      value: "",
      type: "default",
      enabled: true
    },
    {
      key: "meetingId",
      value: "",
      type: "default",
      enabled: true
    },
    {
      key: "discussionId",
      value: "",
      type: "default",
      enabled: true
    },
    {
      key: "repoId",
      value: "",
      type: "default",
      enabled: true
    },
    {
      key: "organizationId",
      value: "",
      type: "default",
      enabled: true
    }
  ],
  _postman_variable_scope: "environment"
};

fs.writeFileSync("collabix-local.postman_environment.json", JSON.stringify(environment, null, 2), "utf8");
console.log("Successfully wrote collabix-local.postman_environment.json");
