-- University Student Planner App - Database Schema
-- SQLite3 Database Schema for Phases 1-3

-- ============================================================================
-- PHASE 1: Core Tables
-- ============================================================================

-- Users Table
CREATE TABLE users (
  uid INTEGER PRIMARY KEY AUTOINCREMENT,
  username VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  salt VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

-- Sessions Table
CREATE TABLE sessions (
  sid VARCHAR(255) PRIMARY KEY,
  uid INTEGER NOT NULL,
  expires TIMESTAMP NOT NULL,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

-- Tasks Table
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid INTEGER NOT NULL,
  course_id INTEGER,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50),
  date DATE NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
);

-- Recurring Tasks Table
CREATE TABLE recurring_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid INTEGER NOT NULL,
  course_id INTEGER,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  days_of_week VARCHAR(50),
  time_hour INTEGER,
  time_minute INTEGER,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
);

-- ============================================================================
-- PHASE 3: Student Features Tables
-- ============================================================================

-- Courses Table (for categorization and grouping)
CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid INTEGER NOT NULL,
  course_name VARCHAR(255) NOT NULL,
  course_code VARCHAR(50),
  color_code VARCHAR(7),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE,
  UNIQUE(uid, course_code)
);

-- Study Logs Table (for time tracking)
CREATE TABLE study_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid INTEGER NOT NULL,
  task_id INTEGER,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- ============================================================================
-- INDEXES for Performance
-- ============================================================================

CREATE INDEX idx_tasks_uid ON tasks(uid);
CREATE INDEX idx_tasks_date ON tasks(date);
CREATE INDEX idx_tasks_completed ON tasks(completed);
CREATE INDEX idx_recurring_tasks_uid ON recurring_tasks(uid);
CREATE INDEX idx_recurring_tasks_active ON recurring_tasks(active);
CREATE INDEX idx_courses_uid ON courses(uid);
CREATE INDEX idx_study_logs_uid ON study_logs(uid);
CREATE INDEX idx_study_logs_task_id ON study_logs(task_id);
CREATE INDEX idx_sessions_uid ON sessions(uid);

-- ============================================================================
-- Schema Notes
-- ============================================================================
-- 
-- Users Table:
--   - uid: Unique user identifier (auto-increment)
--   - username: Unique username for login
--   - password_hash: Bcrypt or similar hashed password
--   - salt: Salt for password hashing
--   - created_at: Account creation timestamp
--   - last_login: Tracks last login time
--
-- Sessions Table:
--   - sid: Session ID (usually UUID or JWT)
--   - uid: User ID (foreign key)
--   - expires: Session expiration timestamp
--   - Tracks active user sessions for authentication
--
-- Tasks Table:
--   - id: Unique task identifier
--   - uid: User ID (task owner)
--   - course_id: Associated course/category (nullable, for Phase 3)
--   - title: Task title/name
--   - description: Detailed task description
--   - type: Task type (e.g., "assignment", "exam", "project")
--   - date: Due date for the task
--   - completed: Boolean flag for task completion status
--   - created_at & updated_at: Timestamps for tracking
--
-- Recurring Tasks Table:
--   - id: Unique recurring task identifier
--   - uid: User ID (task owner)
--   - course_id: Associated course/category (nullable, for Phase 3)
--   - title, description: Same as tasks
--   - days_of_week: Comma-separated days (e.g., "1,3,5" for MWF)
--   - time_hour, time_minute: Time of day for the recurring task
--   - active: Whether the recurring task is currently active
--   - Expanded on-the-fly into individual tasks for display (4-week window)
--
-- Courses Table (Phase 3):
--   - id: Unique course identifier
--   - uid: User ID (course owner)
--   - course_name: Course name (e.g., "Data Structures")
--   - course_code: Course code (e.g., "CS201")
--   - color_code: Hex color for UI categorization
--   - Unique constraint on (uid, course_code) to prevent duplicates per user
--
-- Study Logs Table (Phase 3):
--   - id: Unique log entry identifier
--   - uid: User ID
--   - task_id: Associated task (nullable if logging general study)
--   - start_time, end_time: Study session timestamps
--   - duration_minutes: Calculated duration in minutes
--   - notes: Optional notes about the study session
--   - Tracks time spent on studying for analytics and reporting
--
-- ============================================================================
