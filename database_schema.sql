-- University Student Planner App - Database Schema
-- SQLite3 Database Schema
--
-- This file reflects the schema as actually created/managed at runtime by
-- backend/dbManager.ts. IDs are TEXT (UUIDs generated with crypto.randomUUID()),
-- timestamps are stored as TEXT (ISO-8601 strings), and booleans are stored as
-- INTEGER (0/1). PRAGMA foreign_keys = ON and journal_mode = WAL are enabled on
-- connection.

-- ============================================================================
-- PHASE 1: Core Tables
-- ============================================================================

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login TEXT
);

-- Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  expires TEXT NOT NULL,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- Tasks Table (one-time tasks)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  course_id TEXT,                       -- nullable; added via migration, no FK enforced
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  date TEXT,
  completed INTEGER NOT NULL DEFAULT 0,  -- 0 = false, 1 = true
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- Recurring Tasks Table
CREATE TABLE IF NOT EXISTS recurring_tasks (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  course_id TEXT,                       -- nullable; added via migration, no FK enforced
  title TEXT NOT NULL,
  description TEXT,
  days_of_week TEXT,                    -- JSON array of day names, e.g. ["MONDAY","WEDNESDAY"]
  time_hour INTEGER,
  time_minute INTEGER,
  active INTEGER NOT NULL DEFAULT 1,    -- 0 = false, 1 = true
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- Recurring Task Completions Table
-- Tracks which individual occurrences of a recurring task have been completed.
-- A row exists only for completed instances; absence means not completed.
CREATE TABLE IF NOT EXISTS recurring_task_completions (
  id TEXT PRIMARY KEY,
  recurring_task_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  instance_date TEXT NOT NULL,          -- the specific occurrence date (YYYY-MM-DD)
  UNIQUE(recurring_task_id, instance_date),
  FOREIGN KEY (recurring_task_id) REFERENCES recurring_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- Events Table (one-time events with a start and end)
-- Like tasks but time-blocked: they span a start_time..end_time rather than a
-- single date. type is always ONE_TIME for rows in this table.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  course_id TEXT,                       -- nullable; no FK enforced
  title TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,             -- ISO-8601 start datetime
  end_time TEXT NOT NULL,               -- ISO-8601 end datetime
  completed INTEGER NOT NULL DEFAULT 0,  -- 0 = false, 1 = true
  source_uid TEXT,                      -- iCal UID for imported events; NULL for manual ones
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- Recurring Events Table
CREATE TABLE IF NOT EXISTS recurring_events (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  course_id TEXT,                       -- nullable; no FK enforced
  title TEXT NOT NULL,
  description TEXT,
  days_of_week TEXT,                    -- JSON array of day names, e.g. ["MONDAY","WEDNESDAY"]
  start_hour INTEGER,
  start_minute INTEGER,
  end_hour INTEGER,
  end_minute INTEGER,
  active INTEGER NOT NULL DEFAULT 1,    -- 0 = false, 1 = true
  source_uid TEXT,                      -- iCal UID for imported events; NULL for manual ones
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- Recurring Event Completions Table
-- Tracks which individual occurrences of a recurring event have been completed.
-- A row exists only for completed instances; absence means not completed.
CREATE TABLE IF NOT EXISTS recurring_event_completions (
  id TEXT PRIMARY KEY,
  recurring_event_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  instance_date TEXT NOT NULL,          -- the specific occurrence date (YYYY-MM-DD)
  UNIQUE(recurring_event_id, instance_date),
  FOREIGN KEY (recurring_event_id) REFERENCES recurring_events(id) ON DELETE CASCADE,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- ============================================================================
-- PHASE 3: Student Features Tables
-- ============================================================================

-- Courses Table (for categorization and grouping)
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  course_name TEXT NOT NULL,
  course_code TEXT,
  color_code TEXT,                      -- hex color for UI categorization, e.g. #667eea
  created_at TEXT NOT NULL,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- Settings Table (per-user university/app settings)
-- One row per user. term_dates are stored in a companion table below.
CREATE TABLE IF NOT EXISTS settings (
  uid TEXT PRIMARY KEY,
  term_system TEXT NOT NULL,            -- 'SEMESTER' (2 terms) or 'TRIMESTER' (3 terms)
  flex_week INTEGER NOT NULL,           -- which teaching week is the flex/non-teaching week
  ical_url TEXT,                        -- saved iCal timetable subscription URL (nullable)
  updated_at TEXT NOT NULL,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- Settings Term Dates Table
-- Start/end (day + month, year-agnostic) of each term. term_index 0 = Term 1, etc.
CREATE TABLE IF NOT EXISTS settings_term_dates (
  uid TEXT NOT NULL,
  term_index INTEGER NOT NULL,
  start_day INTEGER NOT NULL,
  start_month INTEGER NOT NULL,
  end_day INTEGER NOT NULL,
  end_month INTEGER NOT NULL,
  PRIMARY KEY (uid, term_index),
  FOREIGN KEY (uid) REFERENCES settings(uid) ON DELETE CASCADE
);

-- Study Logs Table (for time tracking)
-- PLANNED (Phase 3B) — not yet created by dbManager.ts.
CREATE TABLE IF NOT EXISTS study_logs (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  task_id TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- ============================================================================
-- INDEXES for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tasks_uid ON tasks(uid);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
CREATE INDEX IF NOT EXISTS idx_tasks_course_id ON tasks(course_id);
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_uid ON recurring_tasks(uid);
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_active ON recurring_tasks(active);
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_course_id ON recurring_tasks(course_id);
CREATE INDEX IF NOT EXISTS idx_recurring_completions_task ON recurring_task_completions(recurring_task_id);
CREATE INDEX IF NOT EXISTS idx_recurring_completions_uid ON recurring_task_completions(uid);
CREATE INDEX IF NOT EXISTS idx_events_uid ON events(uid);
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_completed ON events(completed);
CREATE INDEX IF NOT EXISTS idx_events_course_id ON events(course_id);
CREATE INDEX IF NOT EXISTS idx_recurring_events_uid ON recurring_events(uid);
CREATE INDEX IF NOT EXISTS idx_recurring_events_active ON recurring_events(active);
CREATE INDEX IF NOT EXISTS idx_recurring_events_course_id ON recurring_events(course_id);
CREATE INDEX IF NOT EXISTS idx_recurring_event_completions_event ON recurring_event_completions(recurring_event_id);
CREATE INDEX IF NOT EXISTS idx_recurring_event_completions_uid ON recurring_event_completions(uid);
CREATE INDEX IF NOT EXISTS idx_courses_uid ON courses(uid);
CREATE INDEX IF NOT EXISTS idx_study_logs_uid ON study_logs(uid);
CREATE INDEX IF NOT EXISTS idx_study_logs_task_id ON study_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);

-- ============================================================================
-- Schema Notes
-- ============================================================================
--
-- Conventions:
--   - All primary keys are TEXT UUIDs (crypto.randomUUID()).
--   - All timestamps/dates are TEXT ISO-8601 strings.
--   - Booleans (completed, active) are stored as INTEGER 0/1.
--
-- Users Table:
--   - uid: Unique user identifier (UUID)
--   - username: Unique username for login
--   - password_hash / salt: Hashed credential material
--   - created_at: Account creation timestamp
--   - last_login: Tracks last login time
--
-- Sessions Table:
--   - sid: Session ID
--   - uid: User ID (foreign key)
--   - expires: Session expiration timestamp
--
-- Tasks Table:
--   - course_id: Associated course/category (nullable). Added by an ALTER TABLE
--     migration in dbManager.ts for existing databases; no FK constraint is
--     enforced on this column.
--
-- Recurring Tasks Table:
--   - days_of_week: JSON array of day names, e.g. ["MONDAY","WEDNESDAY","FRIDAY"]
--   - time_hour, time_minute: Time of day (24-hour) for the recurring task
--   - active: Whether the recurring task is currently active
--   - Expanded on-the-fly into individual instances for display (4-week window)
--
-- Recurring Task Completions Table:
--   - Records completion of a single occurrence (instance_date) of a recurring
--     task. Presence of a row = that instance is completed.
--   - UNIQUE(recurring_task_id, instance_date) prevents duplicate completions.
--
-- Courses Table (Phase 3):
--   - course_name: Course name (e.g., "Data Structures")
--   - course_code: Optional course code (e.g., "CS201")
--   - color_code: Hex color for UI categorization
--
-- Events / Recurring Events Tables:
--   - source_uid: The iCal UID of an event imported from an iCal feed; NULL for
--     events created by hand. Combined with start_time it de-duplicates re-imports
--     (see the iCal import notes below). Added via an ALTER TABLE migration in
--     dbManager.ts for existing databases.
--
-- Settings / Settings Term Dates Tables:
--   - One settings row per user (term_system, flex_week, ical_url). Older week-based
--     layouts are dropped-and-recreated on connect; ical_url is added via ALTER TABLE
--     for existing databases.
--   - settings_term_dates holds each term's start/end as day+month (year-agnostic).
--
-- iCal Import:
--   - A timetable iCal/webcal URL is saved in settings.ical_url. On import, each
--     VEVENT is expanded into its concrete occurrences and stored as one-time rows in
--     `events` with source_uid set. Re-imports skip rows whose (source_uid, start_time)
--     already exist, so re-syncing adds only new occurrences.
--
-- Study Logs Table (Phase 3B — PLANNED):
--   - Not yet created by dbManager.ts. Included here as the intended design.
--
-- ============================================================================
