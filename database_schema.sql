-- University Student Planner App - Database Schema
-- SQLite3 Database Schema
--
-- This file reflects the schema as actually created at runtime by
-- backend/db/connection.ts. IDs are TEXT (UUIDs generated with crypto.randomUUID()),
-- timestamps are stored as TEXT (ISO-8601 strings), and booleans are stored as
-- INTEGER (0/1). PRAGMA foreign_keys = ON and journal_mode = WAL are enabled on
-- connection. There are no migrations: connect only creates missing tables and does not
-- reconcile databases from older schema versions — delete the DB file to rebuild.

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

-- Courses Table (for categorization and grouping)
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY,                -- auto-incrementing rowid
  uid TEXT NOT NULL,
  course_name TEXT NOT NULL,
  course_code TEXT,
  color_code TEXT,                      -- hex color for UI categorization, e.g. #667eea
  created_at TEXT NOT NULL,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- Items Table (unified tasks + events, one-time + recurring)
-- A single table replaces the former tasks / recurring_tasks / events / recurring_events.
-- Two discriminator columns say what a row is:
--   kind       = 'TASK'  (a point in time) | 'EVENT' (a time-blocked span)
--   recurrence = 'ONE_TIME' | 'RECURRING'
-- ONE_TIME rows use start_time/end_time and `completed`.
-- RECURRING rows are described by an iCal RRULE in `rrule` (+ exdate/rdate), anchored by
-- start_date/start_time; an app-native weekly pattern is just FREQ=WEEKLY;BYDAY=...
-- Per-occurrence completion lives in the completions table below.
-- EVENT rows carry an end (end_time / end_date); TASK rows leave it NULL.
-- iCal imports are stored one row per VEVENT series: recurring VEVENTs keep their RRULE
-- (rather than being expanded), anchored by start_date/start_time with duration from
-- end_date/end_time, and identified by ical_uid within their source subscription.
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,               -- auto-incrementing rowid
  uid TEXT NOT NULL,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,  -- nullable
  kind TEXT NOT NULL,                   -- 'TASK' | 'EVENT'
  recurrence TEXT NOT NULL,             -- 'ONE_TIME' | 'RECURRING'
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,                        -- free-text location, e.g. from an imported VEVENT
  start_date TEXT,                      -- ONE_TIME: task due datetime / event start (ISO-8601);
                                         -- iCal RECURRING: the RRULE anchor (master DTSTART)
  end_date TEXT,                        -- ONE_TIME event end (ISO-8601); NULL for tasks;
                                         -- iCal RECURRING: master DTEND (occurrence duration)
  completed INTEGER,                    -- ONE_TIME only; 0 = false, 1 = true, NULL otherwise
  start_time TEXT,                      -- RECURRING: time-of-day (HH:mm:ss)
  end_time TEXT,                        -- RECURRING: time-of-day (HH:mm:ss); events only
  source_uid INTEGER REFERENCES icals(id) ON DELETE CASCADE,  -- which iCal subscription this
                                         -- was imported from; NULL for manually created rows
  ical_uid TEXT,                        -- iCal: source VEVENT UID (stable re-import identity); NULL for manual rows
  rrule TEXT,                           -- RECURRING recurrence rule (app-native weekly = FREQ=WEEKLY;BYDAY=...; iCal = VEVENT RRULE)
  exdate TEXT,                          -- iCal RECURRING: JSON array of excluded ISO datetimes (term breaks)
  rdate TEXT,                           -- iCal RECURRING: JSON array of extra ISO datetimes
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- iCals Table (saved calendar subscriptions)
-- One row per iCal/webcal feed a user has added. items.source_uid -> icals.id records
-- which subscription an imported item came from; deleting a subscription cascades to
-- its imported items.
CREATE TABLE IF NOT EXISTS icals (
  id INTEGER PRIMARY KEY,               -- auto-incrementing rowid
  uid TEXT NOT NULL,
  url TEXT NOT NULL,                    -- the iCal/webcal feed URL
  active INTEGER NOT NULL,              -- 0/1, whether the subscription is still syncing
  last_imported TEXT NOT NULL,          -- ISO-8601 timestamp of the last successful import
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- Completions Table (per-occurrence completion for RECURRING items)
-- A row exists only for completed instances; absence means not completed. item_id -> items(id),
-- so completions cascade-delete when the item is removed.
CREATE TABLE IF NOT EXISTS completions (
  item_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  instance_date TEXT NOT NULL,          -- the specific occurrence date (YYYY-MM-DD)
  PRIMARY KEY (item_id, instance_date),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- ============================================================================
-- PHASE 3: Student Features Tables
-- ============================================================================

-- Settings Table (per-user university/app settings)
-- One row per user. term_dates are stored in a companion table below.
CREATE TABLE IF NOT EXISTS settings (
  uid TEXT PRIMARY KEY,
  term_system TEXT NOT NULL,            -- 'SEMESTER' (2 terms) or 'TRIMESTER' (3 terms)
  flex_week INTEGER NOT NULL,           -- which teaching week is the flex/non-teaching week
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
  item_id TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- ============================================================================
-- INDEXES for Performance
-- ============================================================================

-- Not yet created by connection.ts; listed here as the intended indexing plan.
CREATE INDEX IF NOT EXISTS idx_items_uid ON items(uid);
-- The app fetches an item set by (uid, kind, recurrence), so a composite index fits best.
CREATE INDEX IF NOT EXISTS idx_items_uid_kind_recurrence ON items(uid, kind, recurrence);
CREATE INDEX IF NOT EXISTS idx_items_start_time ON items(start_time);
CREATE INDEX IF NOT EXISTS idx_items_course_id ON items(course_id);
CREATE INDEX IF NOT EXISTS idx_items_source_uid ON items(source_uid);
-- completions(item_id) is already the leftmost PK column, so only uid needs its own index.
CREATE INDEX IF NOT EXISTS idx_completions_uid ON completions(uid);
CREATE INDEX IF NOT EXISTS idx_courses_uid ON courses(uid);
CREATE INDEX IF NOT EXISTS idx_icals_uid ON icals(uid);
CREATE INDEX IF NOT EXISTS idx_study_logs_uid ON study_logs(uid);
CREATE INDEX IF NOT EXISTS idx_study_logs_item_id ON study_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);

-- ============================================================================
-- Schema Notes
-- ============================================================================
--
-- Conventions:
--   - All primary keys are TEXT UUIDs (crypto.randomUUID()).
--   - All timestamps/dates are TEXT ISO-8601 strings.
--   - Booleans (completed) are stored as INTEGER 0/1.
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
-- Items Table:
--   - Unifies the former tasks / recurring_tasks / events / recurring_events tables.
--   - kind: 'TASK' (a point in time) or 'EVENT' (a time-blocked span with an end).
--   - recurrence: 'ONE_TIME' or 'RECURRING'.
--   - ONE_TIME rows: start_date (task due datetime / event start),
--     end_date (event end, NULL for tasks), completed.
--   - RECURRING rows: days_of_week (JSON array of day names). Expanded on the fly into
--     individual instances for display (4-week window); per-occurrence completion lives
--     in the completions table.
--   - location: free-text location, e.g. carried over from an imported VEVENT.
--   - course_id: Associated course/category (nullable), FK to courses(id) ON DELETE SET NULL.
--   - source_uid: FK to icals(id) ON DELETE CASCADE — which iCal subscription an item was
--     imported from; NULL for rows created by hand (see the iCal import notes below).
--
-- iCals Table:
--   - One row per saved iCal/webcal subscription (id, url, active, last_imported).
--   - items.source_uid -> icals.id; deleting a subscription cascades to its imported items.
--
-- Completions Table:
--   - Records completion of a single occurrence (instance_date) of a RECURRING item (task or
--     event). Presence of a row = that instance is completed.
--   - item_id -> items(id); PRIMARY KEY (item_id, instance_date) prevents duplicates, and the
--     FK cascade removes completions when the owning item is deleted.
--
-- Courses Table (Phase 3):
--   - course_name: Course name (e.g., "Data Structures")
--   - course_code: Optional course code (e.g., "CS201")
--   - color_code: Hex color for UI categorization
--
-- Settings / Settings Term Dates Tables:
--   - One settings row per user (term_system, flex_week).
--   - settings_term_dates holds each term's start/end as day+month (year-agnostic).
--
-- iCal Import:
--   - A timetable iCal/webcal subscription is saved as a row in `icals` (url, active,
--     last_imported). On import, each VEVENT is expanded into its concrete occurrences and
--     stored as ONE_TIME EVENT rows in `items` with source_uid set to the subscription's id.
--     Re-imports skip rows whose (source_uid, start_date) already exist, so re-syncing adds
--     only new occurrences.
--
-- Study Logs Table (Phase 3B — PLANNED):
--   - Not yet created by dbManager.ts. Included here as the intended design.
--
-- ============================================================================
