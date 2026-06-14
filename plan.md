# University Student Planner App - Development Plan

## Plan: Multi-Phase Build from JSON to SQL with Feature Completion

**TL;DR:** Migrate from JSON to SQL database while completing incomplete features (calendar, task editing, status tracking), then add student-specific features (categories, course grouping, study time tracking) in phases. MVP targets core deadline/recurring task management within 1-2 weeks; subsequent phases add calendar, polish, and advanced features.

---

## Phase Breakdown

### PHASE 1: Database Migration to SQL (Foundation)
**Goal:** Replace JSON file database with relational SQL structure without losing existing functionality

**Dependencies:** None (foundation phase)

**Steps:**
1. Set up SQL database (PostgreSQL or SQLite recommended for dev)
   - Create users table with proper schema (uid, username, password_hash, salt, created_at, last_login)
   - Create tasks table (id, uid, title, description, type, date, completed, created_at)
   - Create recurring_tasks table (id, uid, title, description, days_of_week, time_hour, time_minute, active)
   - Create courses table (id, uid, course_name, course_code, color_code) [for later category grouping]
   - Create sessions table (sid, uid, expires)

2. Install and configure database driver
   - Add postgres or sqlite3 to dependencies
   - Create database connection pool/manager in backend/

3. Update [backend/dbManager.ts](backend/dbManager.ts) to use SQL instead of JSON
   - Reimplement `readDB()`, `writeDB()`, `createUser()`, `getUserByUsername()`, `getUserByUID()`
   - Reimplement task CRUD operations

4. Update [backend/auth.ts](backend/auth.ts) to use new DB layer
   - Test registration, login, logout with SQL backend

5. Update [backend/API.ts](backend/API.ts) task routes to use SQL
   - Verify POST, GET, DELETE endpoints still work

6. Migrate existing data from DB.json to SQL database

7. Test all existing features work identically with SQL backend

**Files to modify:**
- `backend/dbManager.ts` — Complete rewrite for SQL
- `backend/auth.ts` — Minimal changes (already abstracts DB)
- `backend/API.ts` — Minimal changes (already abstracts DB)
- `server.ts` — May need connection initialization
- `package.json` — Add database driver dependency

**Verification:**
- [ ] Register new user, verify stored in SQL with hashed password
- [ ] Login with registered user, receive session cookie
- [ ] Create task via POST /api/tasks, verify in database
- [ ] Fetch tasks via GET /api/tasks, returns all user tasks
- [ ] Delete task via DELETE /api/tasks/:id
- [ ] Logout clears session
- [ ] All existing dashboard UI works without changes

---

### PHASE 2: Complete Core Features (MVP)
**Goal:** Fill in incomplete features and enable full task lifecycle

**Dependencies:** Completes after Phase 1

**Steps:**

1. Task Status & Completion (Task Lifecycle)
   - Add PATCH /api/tasks/:id endpoint to update task status (completed: true/false)
   - Update dashboard UI with toggle/checkbox to mark tasks complete
   - Visual indication for completed tasks (strikethrough or greyed out)

2. Task Editing
   - Add PUT /api/tasks/:id endpoint to update task properties
   - Update dashboard form to allow editing existing tasks
   - Populate form when clicking "edit" on a task

3. Recurring Task Scheduler
   - Implement server-side recurring task expansion:
     - On task fetch, expand recurring tasks into individual instances for next 4 weeks
     - Store expanded instances or generate on-the-fly (recommend on-the-fly initially)
   - Display upcoming recurring instances in task list

4. Complete Calendar View
   - Implement full calendar rendering for current/next month
   - Display assigned tasks/deadlines on calendar dates
   - Click date to see/add tasks for that day
   - Navigation to previous/next months

5. Task Filtering & Sorting
   - Add filters: "Today", "This Week", "Overdue", "Completed"
   - Sort by: date, priority, completion status
   - Add filter UI to dashboard

6. Error Handling & Validation
   - Standardize API error responses using [backend/error/appError.ts](backend/error/appError.ts)
   - Add input validation on all task endpoints
   - Client-side form validation improvements

**Files to modify:**
- `backend/API.ts` — Add PATCH, PUT endpoints; improve error handling
- `public/dashboard/dashboard.ts` — Complete calendar UI, add edit/update forms, add filters
- `public/dashboard/dashboard.html` — Add filter buttons, edit form, calendar grid
- `public/dashboard/dashboard.css` — Style calendar, completed state, filters
- `backend/types/TaskTypes.ts` — May need updates for expanded recurring instances

**Verification:**
- [ ] Create task, mark completed, verify UI updates and persists
- [ ] Edit task title/date, verify updates in database
- [ ] View recurring task (weekly lecture), see 4 instances expanded in calendar
- [ ] Filter tasks by "Today", "This Week" — returns correct subset
- [ ] Calendar displays all tasks for the month
- [ ] Click date on calendar to add/view tasks for that day
- [ ] Submit invalid task (empty title, past date) shows validation error

---

### PHASE 3: Student Features & Polish
**Goal:** Add student-specific functionality and improve UX

**Dependencies:** Completes after Phase 2

**3A. Categories & Course Grouping**
1. Create UI to manage courses/subjects (add, delete, assign color)
2. Update task creation to assign course/category
3. Update task list to show course category with color coding
4. Add filter by course/category
5. Dashboard view option: group tasks by course

**3B. Study Time Tracking**
1. Add study_logs table to track when student studies a task
2. Create "Start Study Session" button on tasks
3. Track elapsed time per task
4. Display total study hours per task/course
5. Add study summary view

**3C. Advanced Filtering & Views**
1. Search tasks by keyword
2. Deadline urgency indicators (due today, due this week, due this month)
3. "My Week" view with weekly overview
4. Task statistics dashboard (tasks completed, upcoming deadlines)

**4D. UI Polish**
1. Mobile-responsive improvements (already supporting web)
2. Dark mode toggle (optional)
3. Keyboard shortcuts for quick actions
4. Drag-and-drop task reordering (optional)

**Files to modify:**
- `backend/types/TaskTypes.ts` — Add course association, study tracking
- `backend/API.ts` — New endpoints for courses, study logs
- `backend/dbManager.ts` — Add course/study log CRUD
- `public/dashboard/` — UI for all new features
- Frontend component structure may need refactoring for reusability

**Verification:**
- [ ] Create course "CS101", assign blue color
- [ ] Create task and assign to CS101, displays with blue label
- [ ] Click "Start Study", timer runs, "Stop Study" saves elapsed time
- [ ] Filter by "CS101" shows only tasks for that course
- [ ] Study Summary shows total hours per course

---

## Relevant Files

- `server.ts` — Main Express server entry
- `backend/dbManager.ts` — Database layer (complete rewrite for Phase 1)
- `backend/auth.ts` — Authentication (minor updates)
- `backend/API.ts` — API endpoints (updates in each phase)
- `backend/types/TaskTypes.ts` — Type definitions (extends in Phase 3)
- `backend/error/appError.ts` — Error handling (use in Phase 2)
- `public/dashboard/dashboard.ts` — Main frontend UI (major updates in Phase 2-3)
- `public/dashboard/dashboard.html` — Dashboard HTML template
- `public/dashboard/dashboard.css` — Styling
- `package.json` — Update dependencies for SQL driver

---

## Architecture Decisions

1. **Database Choice:** PostgreSQL (production-ready, relational) or SQLite (simpler dev setup initially)
   - Recommendation: Start with SQLite for fast dev iteration, migrate to PostgreSQL later if needed
   
2. **Recurring Task Expansion:** Generate on-the-fly vs. store instances
   - Recommendation: Generate on-the-fly to reduce database bloat; only expand 4 weeks ahead
   
3. **Calendar Rendering:** Server-side generation vs. client-side
   - Recommendation: Client-side generation (dashboard.ts) for lower server load; server provides data only

4. **Study Tracking:** In-memory timer vs. server-side timer
   - Recommendation: Client-side timer with periodic sync to server to avoid duplicate entries

---

## Implementation Order & Parallelization

**Phase 1 (Sequential — Foundation):**
1. Set up SQL database schema
2. Update dbManager.ts (blocks everything)
3. Test auth flow → API endpoints
4. Data migration

**Phase 2 (Mostly Sequential with some parallelization possible):**
- Task status/completion (blocks Filtering step)
- *Parallel:* Task editing + Calendar view (independent)
- Recurring scheduler (independent)
- Filtering/Sorting (depends on completion)
- Error handling (can happen anytime)

**Phase 3 (Parallelizable):**
- Courses/Categories (independent)
- *Parallel:* Study tracking + Advanced filtering (independent, but optional)
- UI Polish (can happen in parallel with features)

---

## Scope & Exclusions

**Included (MVP + Phase 3):**
- ✓ User authentication (already done)
- ✓ Task CRUD with dates
- ✓ Recurring tasks
- ✓ Calendar view
- ✓ Task filtering
- ✓ Course categories
- ✓ Study time tracking
- ✓ SQL database

**Explicitly Excluded (Future Enhancements):**
- ✗ Mobile apps (native iOS/Android) — web only
- ✗ Real-time collaboration / shared tasks
- ✗ Calendar sync (Google Calendar, Outlook)
- ✗ Email/push notifications for now (can add later)
- ✗ AI-powered deadline suggestions
- ✗ Integration with LMS (Canvas, Blackboard) — future phase

---

## Key Risks & Mitigations

1. **Database migration breaking existing features**
   - Mitigation: Keep JSON backup, test each operation independently before moving forward
   
2. **Recurring task expansion creating performance issues**
   - Mitigation: Limit expansion to 4 weeks max; use pagination if list grows
   
3. **Calendar rendering becoming complex**
   - Mitigation: Start with simple month view, add features incrementally
   
4. **Time tracking logic becoming complicated**
   - Mitigation: Keep simple initially (elapsed time only), add analytics later

---

## Estimated Effort

- **Phase 1 (Database):** 4-6 hours
- **Phase 2 (Core Features):** 8-12 hours
- **Phase 3A (Courses/Categories):** 4-6 hours
- **Phase 3B (Study Tracking):** 4-6 hours
- **Phase 3C-D (Polish & Advanced):** 4-6 hours

**Total MVP (Phases 1-2): ~12-18 hours (1.5-2 weeks part-time)**
**Full Feature (All phases): ~28-40 hours (3-5 weeks part-time)**

