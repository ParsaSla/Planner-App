-- University Student Planner: current fresh-database SQLite schema.
-- Matches the tables, columns, and constraints in backend/db/connection.ts.
-- The application initializes its schema in TypeScript; it does not load this file.
-- This is a schema snapshot, not an upgrade/migration script.
--
-- users.uid and sessions.sid are application-generated TEXT UUIDs.
-- courses.id, icals.id, and items.id are INTEGER PRIMARY KEY rowid aliases;
-- IDs are assigned by SQLite without the AUTOINCREMENT keyword.
-- Datetimes are ISO-8601 TEXT; wall-clock times use HH:mm:ss.
-- Enum/boolean conventions are enforced by application code, not CHECK constraints.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  expires TEXT NOT NULL,
  FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL,
  course_name TEXT NOT NULL,
  course_code TEXT,
  color_code TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- One saved outline snapshot per course. Ownership is inherited from courses.
CREATE TABLE IF NOT EXISTS course_outlines (
  course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  result_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS icals (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL,
  url TEXT NOT NULL,
  active INTEGER NOT NULL,              -- Stored flag; reads/refresh do not currently enforce it.
  last_imported TEXT NOT NULL,          -- Set on subscription creation and successful import.
  FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- ONE_TIME rows store a concrete start/end span and use completed.
-- RECURRING rows store an RRULE plus wall-clock times in timezone; completions
-- are separate rows. Manual end_date is a series cutoff used to construct UNTIL;
-- imported end_date is the master VEVENT's DTEND, not the series cutoff.
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,                   -- Current writers: '' for manual items, 'EVENT' for imports.
  recurrence TEXT NOT NULL,             -- Application convention: ONE_TIME or RECURRING.
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_date TEXT,                      -- Concrete start or recurring anchor, UTC ISO datetime.
  end_date TEXT,                        -- Concrete end, manual series cutoff, or imported DTEND.
  completed INTEGER,                    -- One-time: 0/1. Recurring: NULL; use completions.
  start_time TEXT,                      -- Wall-clock HH:mm:ss; NULL for manual one-time items.
  end_time TEXT,                        -- Wall-clock HH:mm:ss; imports store times for both kinds.
  timezone TEXT,                        -- IANA zone; NULL interpreted as floating/UTC.
  all_day INTEGER,                      -- 1 for imported date-only events; NULL/0 otherwise.
  source_uid INTEGER REFERENCES icals(id) ON DELETE CASCADE, -- NULL for manual items.
  ical_uid TEXT,                        -- Source VEVENT UID, not the subscription ID.
  rrule TEXT,                           -- Weekly rule for manual series; feed rule for imports.
  exdate TEXT,                          -- JSON array of excluded ISO datetimes, or NULL.
  rdate TEXT,                           -- JSON array of extra ISO datetimes, or NULL.
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- Presence of a row means the recurring occurrence is complete.
-- Maps an outline deadline to one planner item; NULL item_id remembers user deletion.
CREATE TABLE IF NOT EXISTS course_outline_items (
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  item_id INTEGER UNIQUE REFERENCES items(id) ON DELETE SET NULL,
  managed INTEGER NOT NULL, -- 1 = outline-created; 0 = matched pre-existing item.
  PRIMARY KEY (course_id, source_key)
);

CREATE TABLE IF NOT EXISTS completions (
  item_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  instance_start TEXT NOT NULL,         -- Absolute UTC ISO start, matching occurrence API output.
  PRIMARY KEY (item_id, instance_start),
  FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  uid TEXT PRIMARY KEY,
  term_system TEXT NOT NULL,            -- Application convention: SEMESTER or TRIMESTER.
  flex_week INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings_term_dates (
  uid TEXT NOT NULL,
  term_index INTEGER NOT NULL,          -- Zero-based index; normally 0..1 or 0..2.
  start_day INTEGER NOT NULL,           -- Zero denotes unset for day/month fields.
  start_month INTEGER NOT NULL,
  end_day INTEGER NOT NULL,
  end_month INTEGER NOT NULL,
  PRIMARY KEY (uid, term_index),
  FOREIGN KEY(uid) REFERENCES settings(uid) ON DELETE CASCADE
);

-- No explicit CREATE INDEX statements, triggers, or planned tables are included:
-- the runtime creates only the indexes implicit in PRIMARY KEY/UNIQUE constraints.
-- Import deduplication by (source_uid, ical_uid) and subscription URL uniqueness
-- are application behavior; the schema has no corresponding UNIQUE constraints.
