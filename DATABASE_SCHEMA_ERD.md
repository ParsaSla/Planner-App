# University Planner App - Database Schema (ERD)

## Entity Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ SESSIONS : creates
    USERS ||--o{ TASKS : owns
    USERS ||--o{ RECURRING_TASKS : owns
    USERS ||--o{ COURSES : creates
    USERS ||--o{ STUDY_LOGS : creates
    COURSES ||--o{ TASKS : categorizes
    COURSES ||--o{ RECURRING_TASKS : categorizes
    TASKS ||--o{ STUDY_LOGS : logs

    USERS {
        int uid PK "Primary Key"
        string username UK "Unique"
        string password_hash
        string salt
        timestamp created_at
        timestamp last_login
    }

    SESSIONS {
        string sid PK "Primary Key"
        int uid FK "Foreign Key"
        timestamp expires
    }

    TASKS {
        int id PK "Primary Key"
        int uid FK "Foreign Key"
        int course_id FK "Foreign Key, Nullable"
        string title
        string description
        string type
        date date
        boolean completed "Default: FALSE"
        timestamp created_at
        timestamp updated_at
    }

    RECURRING_TASKS {
        int id PK "Primary Key"
        int uid FK "Foreign Key"
        int course_id FK "Foreign Key, Nullable"
        string title
        string description
        string days_of_week "e.g., 1,3,5"
        int time_hour
        int time_minute
        boolean active "Default: TRUE"
        timestamp created_at
        timestamp updated_at
    }

    COURSES {
        int id PK "Primary Key"
        int uid FK "Foreign Key"
        string course_name
        string course_code
        string color_code "Hex color"
        timestamp created_at
    }

    STUDY_LOGS {
        int id PK "Primary Key"
        int uid FK "Foreign Key"
        int task_id FK "Foreign Key, Nullable"
        timestamp start_time
        timestamp end_time
        int duration_minutes
        string notes
        timestamp created_at
    }
```

## Schema Overview

### Core Tables (Phase 1)

- **USERS**: User authentication and profile
- **SESSIONS**: Active user sessions
- **TASKS**: Individual tasks with due dates
- **RECURRING_TASKS**: Repeating tasks (lectures, assignments, etc.)

### Student Features (Phase 3)

- **COURSES**: Course/subject categorization
- **STUDY_LOGS**: Time tracking for study sessions

## Key Relationships

| Relationship              | Description                                        |
| ------------------------- | -------------------------------------------------- |
| USERS → SESSIONS          | One user can have multiple active sessions         |
| USERS → TASKS             | One user owns multiple tasks                       |
| USERS → RECURRING_TASKS   | One user owns multiple recurring tasks             |
| USERS → COURSES           | One user can create multiple courses               |
| USERS → STUDY_LOGS        | One user can have multiple study logs              |
| COURSES → TASKS           | One course can categorize multiple tasks           |
| COURSES → RECURRING_TASKS | One course can categorize multiple recurring tasks |
| TASKS → STUDY_LOGS        | One task can have multiple study logs              |

## Design Notes

- **User Isolation**: All tables reference `uid` to ensure users see only their own data
- **Soft Relationships**: `course_id` is nullable to allow tasks without course assignment
- **Timestamps**: All tables track creation/update times for auditing
- **Indexes**: Performance indexes on frequently queried columns (uid, date, task_id, active)
- **Cascading Deletes**: Foreign keys use CASCADE to maintain referential integrity when users are deleted
