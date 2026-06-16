# University Student Planner App

A full-stack web application designed to help university students manage their tasks, deadlines, recurring assignments, and study sessions. Built with **Express.js**, **TypeScript**, **SQLite**, and a responsive frontend dashboard.

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Development Setup](#development-setup)
- [Available Scripts](#available-scripts)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Development Phases](#development-phases)
- [Contributing](#contributing)

## Features

### Core Features (MVP - Phase 2)

- ✅ **User Authentication** - Secure registration and login with password hashing
- ✅ **Task Management** - Create, read, update, and delete tasks
- ✅ **Task Status Tracking** - Mark tasks as completed/incomplete
- ✅ **Task Editing** - Modify existing task details
- ✅ **Recurring Tasks** - Set up tasks that repeat on specified days
- ✅ **Course Organization** - Categorize tasks by course
- ✅ **Session Management** - Secure session handling with cookies

### Planned Features (Phase 3+)

- 📅 **Calendar View** - Interactive calendar to visualize deadlines
- 📊 **Study Time Tracking** - Log study sessions and duration
- 🎨 **Course Color Coding** - Visual organization by course
- 📱 **Responsive Design** - Mobile-friendly interface

## Technology Stack

### Backend

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: SQLite (better-sqlite3)
- **Authentication**: Cookie-based sessions with password hashing
- **Build Tool**: tsx (TypeScript executor)

### Frontend

- **Language**: TypeScript
- **Styling**: CSS
- **Architecture**: Vanilla JavaScript with TypeScript

### Development & Testing

- **Package Manager**: npm
- **Testing Framework**: Vitest
- **TypeScript Compiler**: TypeScript 6.0.3
- **Concurrency**: concurrently (run multiple tasks simultaneously)

## Project Structure

```
Planner-App/
├── backend/
│   ├── API.ts                 # Express route handlers
│   ├── auth.ts                # Authentication logic
│   ├── dbManager.ts           # Database operations
│   ├── util.ts                # Utility functions
│   ├── error/
│   │   ├── appError.ts        # Custom error class
│   │   └── errors.ts          # Error definitions
│   └── types/
│       ├── DBTypes.ts         # Database type definitions
│       ├── GeneralTypes.ts    # General type definitions
│       └── TaskTypes.ts       # Task-specific types
├── public/
│   ├── dashboard/             # Main dashboard UI
│   │   ├── dashboard.html
│   │   ├── dashboard.ts
│   │   └── dashboard.css
│   └── login/                 # Login page UI
│       ├── login.html
│       ├── login.ts
│       └── login.css
├── data/                      # SQLite database storage
├── test/
│   └── backend/
│       ├── API.test.ts        # API endpoint tests
│       ├── auth.test.ts       # Authentication tests
│       └── dbManager.test.ts  # Database tests
├── server.ts                  # Main server entry point
├── tsconfig.json              # TypeScript configuration
├── package.json               # Dependencies and scripts
├── database_schema.sql        # SQL schema definition
├── DATABASE_SCHEMA_ERD.md     # Entity-Relationship Diagram
└── plan.md                    # Development roadmap

```

## Installation

### Prerequisites

- Node.js (v18 or higher)
- npm

### Setup Steps

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd Planner-App
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

## Development Setup

### Running the Application

**Development Mode** (with hot reload):

```bash
npm run dev
```

This starts the backend server with TypeScript watch mode enabled.

**Watch Frontend** (compile TypeScript files):

```bash
npm run watch:frontend
```

**Run Both Simultaneously**:

```bash
npm run start:all
```

Uses `concurrently` to run backend and frontend builds in parallel.

### Testing

Run the test suite:

```bash
npm test
```

Available test files:

- `test/backend/API.test.ts` - API endpoint tests
- `test/backend/auth.test.ts` - Authentication tests
- `test/backend/dbManager.test.ts` - Database operation tests

### Database Management

View the SQLite database:

```bash
npm run show:db
```

Opens the database in SQLite Browser.

## Available Scripts

| Command                  | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `npm run dev`            | Start backend server with watch mode           |
| `npm run watch:frontend` | Watch and compile TypeScript frontend files    |
| `npm run build`          | Compile TypeScript to JavaScript               |
| `npm test`               | Run test suite with Vitest                     |
| `npm run start:all`      | Run backend and frontend watchers concurrently |
| `npm run show:db`        | Open SQLite database in SQLite Browser         |

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user

### Tasks

- `GET /api/tasks` - Get all tasks for logged-in user
- `POST /api/tasks` - Create a new task
- `PUT /api/tasks/:id` - Update task details
- `PATCH /api/tasks/:id` - Update task status (completed)
- `DELETE /api/tasks/:id` - Delete a task

### Recurring Tasks

- `GET /api/recurring-tasks` - Get all recurring tasks
- `POST /api/recurring-tasks` - Create a recurring task
- `DELETE /api/recurring-tasks/:id` - Delete a recurring task

### Courses

- `GET /api/courses` - Get user's courses
- `POST /api/courses` - Create a new course
- `DELETE /api/courses/:id` - Delete a course

For detailed API documentation, see the routes defined in [backend/API.ts](backend/API.ts).

## Database Schema

### Tables

**USERS**

- `uid` (PK) - User ID
- `username` (UK) - Unique username
- `password_hash` - Hashed password
- `salt` - Password salt
- `created_at` - Account creation timestamp
- `last_login` - Last login timestamp

**TASKS**

- `id` (PK) - Task ID
- `uid` (FK) - User ID
- `course_id` (FK) - Associated course (optional)
- `title` - Task title
- `description` - Task description
- `type` - Task type
- `date` - Due date
- `completed` - Completion status
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

**RECURRING_TASKS**

- `id` (PK) - Task ID
- `uid` (FK) - User ID
- `course_id` (FK) - Associated course (optional)
- `title` - Task title
- `description` - Task description
- `days_of_week` - Days pattern (e.g., "1,3,5")
- `time_hour` - Hour of day
- `time_minute` - Minute of hour
- `active` - Is active
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

**COURSES**

- `id` (PK) - Course ID
- `uid` (FK) - User ID
- `course_name` - Course name
- `course_code` - Course code
- `color_code` - Hex color for UI
- `created_at` - Creation timestamp

**SESSIONS**

- `sid` (PK) - Session ID
- `uid` (FK) - User ID
- `expires` - Session expiration timestamp

**STUDY_LOGS**

- `id` (PK) - Log ID
- `uid` (FK) - User ID
- `task_id` (FK) - Associated task (optional)
- `start_time` - Study start timestamp
- `end_time` - Study end timestamp
- `duration_minutes` - Total duration
- `notes` - Study notes
- `created_at` - Log creation timestamp

For the complete ERD, see [DATABASE_SCHEMA_ERD.md](DATABASE_SCHEMA_ERD.md).

## Development Phases

### Phase 1: Database Migration ✅ COMPLETED

Migrated from JSON-based storage to SQLite relational database while maintaining all existing functionality.

### Phase 2: Core Features (MVP) 🔄 IN PROGRESS

- ✅ Task status & completion tracking
- ✅ Task editing capabilities
- 🔄 Recurring task scheduler expansion
- ⏳ Complete calendar view

### Phase 3: Polish & Advanced Features

- Study time tracking
- Enhanced UI/UX
- Mobile responsiveness
- Performance optimizations

### Phase 4: Student-Specific Features

- Course-based organization
- Assignment grouping
- Study analytics
- Collaboration features

See [plan.md](plan.md) for the detailed development roadmap.

## Contributing

1. Create a feature branch (`git checkout -b feature/AmazingFeature`)
2. Commit your changes (`git commit -m 'Add AmazingFeature'`)
3. Push to the branch (`git push origin feature/AmazingFeature`)
4. Open a Pull Request
