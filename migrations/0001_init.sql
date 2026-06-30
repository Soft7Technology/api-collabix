-- 0001_init.sql

-- Team Members
CREATE TABLE IF NOT EXISTS team_members (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  role VARCHAR NOT NULL,
  email VARCHAR UNIQUE NOT NULL,
  avatar_color VARCHAR NOT NULL,
  initials VARCHAR NOT NULL
);

-- Projects
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

-- Project Members Mapping Table
CREATE TABLE IF NOT EXISTS project_members (
  project_id VARCHAR REFERENCES projects(id) ON DELETE CASCADE,
  member_id VARCHAR REFERENCES team_members(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, member_id)
);

-- Tasks
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

-- Activity Items
CREATE TABLE IF NOT EXISTS activity_items (
  id VARCHAR PRIMARY KEY,
  actor_id VARCHAR REFERENCES team_members(id) ON DELETE CASCADE,
  action VARCHAR NOT NULL,
  target VARCHAR NOT NULL,
  timestamp VARCHAR NOT NULL
);

-- Sprints
CREATE TABLE IF NOT EXISTS sprints (
  id VARCHAR PRIMARY KEY,
  project_id VARCHAR REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  start_date VARCHAR NOT NULL,
  end_date VARCHAR NOT NULL
);

-- Meetings
CREATE TABLE IF NOT EXISTS meetings (
  id VARCHAR PRIMARY KEY,
  title VARCHAR NOT NULL,
  date VARCHAR NOT NULL,
  start_time VARCHAR NOT NULL,
  end_time VARCHAR NOT NULL
);

-- Meeting Attendees Mapping Table
CREATE TABLE IF NOT EXISTS meeting_attendees (
  meeting_id VARCHAR REFERENCES meetings(id) ON DELETE CASCADE,
  member_id VARCHAR REFERENCES team_members(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, member_id)
);

-- Leaves
CREATE TABLE IF NOT EXISTS leaves (
  id VARCHAR PRIMARY KEY,
  member_id VARCHAR REFERENCES team_members(id) ON DELETE CASCADE,
  type VARCHAR NOT NULL,
  start_date VARCHAR NOT NULL,
  end_date VARCHAR NOT NULL
);

-- Migrations History table to track migrations
CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR UNIQUE NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- SEED DATA REMOVED FOR CLEAN SETUP
