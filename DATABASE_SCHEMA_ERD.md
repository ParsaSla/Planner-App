# University Planner App - Database Schema (ERD)

This diagram reflects the schema as actually created/managed at runtime by
[backend/dbManager.ts](backend/dbManager.ts). All primary keys are TEXT UUIDs,
timestamps/dates are TEXT (ISO-8601 strings), and booleans (`completed`,
`active`) are stored as INTEGER `0`/`1`.

## Entity Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ SESSIONS : creates
    USERS ||--o{ TASKS : owns
    USERS ||--o{ RECURRING_TASKS : owns
    USERS ||--o{ COURSES : creates
    USERS ||--o{ RECURRING_TASK_COMPLETIONS : owns
    USERS ||--o{ STUDY_LOGS : creates
    COURSES ||--o{ TASKS : categorizes
    COURSES ||--o{ RECURRING_TASKS : categorizes
    RECURRING_TASKS ||--o{ RECURRING_TASK_COMPLETIONS : completes
    TASKS ||--o{ STUDY_LOGS : logs

    USERS {
        string uid PK "UUID"
        string username UK "Unique"
        string password_hash
        string salt
        string created_at "ISO-8601"
        string last_login "ISO-8601, Nullable"
    }

    SESSIONS {
        string sid PK "Primary Key"
        string uid FK "Foreign Key"
        string expires "ISO-8601"
    }

    TASKS {
        string id PK "UUID"
        string uid FK "Foreign Key"
        string course_id "Nullable, no FK enforced"
        string title
        string description
        string type
        string date
        int completed "0/1, Default: 0"
        string created_at
        string updated_at
    }

    RECURRING_TASKS {
        string id PK "UUID"
        string uid FK "Foreign Key"
        string course_id "Nullable, no FK enforced"
        string title
        string description
        string days_of_week "JSON array, e.g. [MONDAY,FRIDAY]"
        int time_hour
        int time_minute
        int active "0/1, Default: 1"
        string created_at
        string updated_at
    }

    RECURRING_TASK_COMPLETIONS {
        string id PK "UUID"
        string recurring_task_id FK "Foreign Key"
        string uid FK "Foreign Key"
        string instance_date "YYYY-MM-DD"
    }

    COURSES {
        string id PK "UUID"
        string uid FK "Foreign Key"
        string course_name
        string course_code "Nullable"
        string color_code "Hex color, Nullable"
        string created_at
    }

    STUDY_LOGS {
        string id PK "UUID (PLANNED)"
        string uid FK "Foreign Key"
        string task_id FK "Foreign Key, Nullable"
        string start_time
        string end_time
        int duration_minutes
        string notes
        string created_at
    }
```

## Schema Overview

### Core Tables (Phase 1)

- **USERS**: User authentication and profile
- **SESSIONS**: Active user sessions
- **TASKS**: Individual one-time tasks with due dates
- **RECURRING_TASKS**: Repeating tasks (lectures, weekly assignments, etc.)
- **RECURRING_TASK_COMPLETIONS**: Per-occurrence completion tracking for recurring tasks

### Student Features (Phase 3)

- **COURSES**: Course/subject categorization with color coding
- **STUDY_LOGS** _(planned, Phase 3B — not yet implemented)_: Time tracking for study sessions

## Key Relationships

| Relationship                            | Description                                                  |
| --------------------------------------- | ------------------------------------------------------------ |
| USERS → SESSIONS                        | One user can have multiple active sessions                   |
| USERS → TASKS                           | One user owns multiple tasks                                 |
| USERS → RECURRING_TASKS                 | One user owns multiple recurring tasks                       |
| USERS → COURSES                         | One user can create multiple courses                         |
| USERS → RECURRING_TASK_COMPLETIONS      | One user owns multiple recurring-task completion records     |
| COURSES → TASKS                         | One course can categorize multiple tasks                     |
| COURSES → RECURRING_TASKS               | One course can categorize multiple recurring tasks           |
| RECURRING_TASKS → RECURRING_TASK_COMPLETIONS | One recurring task can have many completed occurrences  |
| TASKS → STUDY_LOGS _(planned)_          | One task can have multiple study logs                        |

## Design Notes

- **Identifiers**: All primary keys are TEXT UUIDs (`crypto.randomUUID()`); timestamps/dates are TEXT ISO-8601 strings; booleans are INTEGER `0`/`1`.
- **User Isolation**: All tables reference `uid` so users see only their own data.
- **Course Association**: `course_id` on `tasks` / `recurring_tasks` is nullable, allowing tasks without a course. It is added by an `ALTER TABLE` migration in `dbManager.ts` for existing databases and is **not** backed by an enforced foreign-key constraint.
- **Recurring Completions**: A row in `recurring_task_completions` exists only for completed occurrences; `UNIQUE(recurring_task_id, instance_date)` prevents duplicates. Recurring instances are expanded on-the-fly (4-week window) at display time.
- **Days of Week**: Stored as a JSON array of day names (e.g. `["MONDAY","WEDNESDAY","FRIDAY"]`).
- **Cascading Deletes**: Enforced foreign keys use `ON DELETE CASCADE` to maintain referential integrity when users or recurring tasks are deleted. `PRAGMA foreign_keys = ON` is set on connection.
- **Study Logs**: Documented as the intended Phase 3B design but not yet created by `dbManager.ts`.
