-- Database Schema for Collabix

-- 1. Team Members Table
CREATE TABLE IF NOT EXISTS team_members (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    role VARCHAR NOT NULL,
    email VARCHAR UNIQUE NOT NULL,
    avatar_color VARCHAR NOT NULL,
    initials VARCHAR NOT NULL
);

-- 2. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    description TEXT,
    status VARCHAR NOT NULL,
    progress INTEGER DEFAULT 0,
    task_count INTEGER DEFAULT 0,
    due_date VARCHAR NOT NULL,
    color VARCHAR NOT NULL
);

-- 3. Project Members Junction Table
CREATE TABLE IF NOT EXISTS project_members (
    project_id VARCHAR REFERENCES projects(id) ON DELETE CASCADE,
    member_id VARCHAR REFERENCES team_members(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, member_id)
);

-- 4. Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR PRIMARY KEY,
    title VARCHAR NOT NULL,
    description TEXT,
    status VARCHAR NOT NULL,
    priority VARCHAR NOT NULL,
    assignee_id VARCHAR REFERENCES team_members(id) ON DELETE SET NULL,
    project_id VARCHAR REFERENCES projects(id) ON DELETE CASCADE,
    due_date VARCHAR NOT NULL,
    created_at VARCHAR NOT NULL
);

-- 5. Sprints Table
CREATE TABLE IF NOT EXISTS sprints (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    start_date VARCHAR NOT NULL,
    end_date VARCHAR NOT NULL
);

-- 6. Meetings Table
CREATE TABLE IF NOT EXISTS meetings (
    id VARCHAR PRIMARY KEY,
    title VARCHAR NOT NULL,
    date VARCHAR NOT NULL,
    start_time VARCHAR NOT NULL,
    end_time VARCHAR NOT NULL
);

-- 7. Meeting Attendees Junction Table
CREATE TABLE IF NOT EXISTS meeting_attendees (
    meeting_id VARCHAR REFERENCES meetings(id) ON DELETE CASCADE,
    member_id VARCHAR REFERENCES team_members(id) ON DELETE CASCADE,
    PRIMARY KEY (meeting_id, member_id)
);

-- 8. Leaves Table
CREATE TABLE IF NOT EXISTS leaves (
    id VARCHAR PRIMARY KEY,
    member_id VARCHAR REFERENCES team_members(id) ON DELETE CASCADE,
    type VARCHAR NOT NULL,
    start_date VARCHAR NOT NULL,
    end_date VARCHAR NOT NULL
);

-- Indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_sprints_project_id ON sprints(project_id);
CREATE INDEX IF NOT EXISTS idx_leaves_member_id ON leaves(member_id);
CREATE INDEX IF NOT EXISTS idx_project_members_member_id ON project_members(member_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_member_id ON meeting_attendees(member_id);
