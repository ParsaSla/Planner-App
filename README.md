# University Student Planner

A planner for one-time and recurring items, course groups, and imported university timetables. The dashboard uses React and TypeScript; Express serves the API and login page, and SQLite stores users, sessions, items, and settings.

## Features

- Register, log in, and log out using a 24-hour cookie session.
- Create, edit, and delete manual items with titles, notes, locations, and course groups.
- Schedule one-time spans or weekly recurring items, with timezone-aware occurrence expansion.
- Track completion for a whole one-time item or a specific recurring occurrence.
- Browse Home's Today, Overdue, and Coming up sections, or the day/week/month calendar.
- Search by item title or group name; create, edit, color, and delete course groups.
- Open a course dashboard, paste a UNSW outline link, and save its assessments, deadlines, resources, contacts, schedule, and extraction details. Review and edit proposed planner deadlines before explicitly adding selected timed tasks; explicit weekly assessment rules can expand into individual due tasks after you set the first and last release dates. Confirmed refreshes preserve completion.
- Preview iCal subscriptions, review detected courses, import events, and refresh feeds.
- Configure semester/trimester dates and a flex-week number.

Imported events have read-only details and schedules. Completion and deletion remain available. Home and Calendar keep independent date ranges and retain loaded events during background refreshes, so completion changes preserve the calendar's scroll position.

## Setup and development

Requires Node.js 20 or newer and npm. Run commands from the repository root:

```bash
npm ci
npm run build
npm run dev
```

AI deadline suggestions use OpenRouter from the server only. Set `OPENROUTER_API_KEY` in the server environment to enable them; optionally set `OPENROUTER_MODEL` to choose a model (default: `openrouter/free`). Free model availability, quotas, and latency are provider-controlled and may change. Outline content sent for suggestions is processed by OpenRouter; configure this only if that external processing is acceptable. Without a key or when the provider fails, deterministic UNSW extraction and the review flow remain available.

Open [the development login page](http://localhost:5173/login/). Vite serves the React dashboard on port 5173 and proxies API, authentication, and `/dist` requests to Express on port 8080. Building once before development creates the compiled login script at `dist/public/login/login.js`.

Express also serves the built dashboard at [http://localhost:8080/](http://localhost:8080/). To use that path without Vite, run `npm run build` followed by `npm run dev:server`; rebuild the client after frontend changes. The provided server command runs TypeScript through `tsx` in watch mode; there is no dedicated production start script.

The server automatically initializes `data/app.db`, enables foreign keys, and uses SQLite WAL mode. No manual SQL import is required. The default database path is relative to the working directory.

## Scripts

| Command                    | Behavior                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`              | Run the Express watcher and Vite development server together.                                                                       |
| `npm run dev:server`       | Run `tsx watch server.ts` on port 8080.                                                                                             |
| `npm run dev:client`       | Run Vite on port 5173, proxying requests to Express.                                                                                |
| `npm run build`            | Compile backend/login TypeScript, type-check the frontend, and build the dashboard.                                                 |
| `npm run build:server`     | Run the root TypeScript compiler, emitting into `dist/`.                                                                            |
| `npm run build:client`     | Build the dashboard into `dist/frontend/` with Vite.                                                                                |
| `npm run typecheck:client` | Check frontend TypeScript without emitting files.                                                                                   |
| `npm test`                 | Run the backend and React regression tests with Vitest.                                                                             |
| `npm run start:all`        | Build the client, then run both development servers. Requires the login script to have been compiled separately or by a full build. |
| `npm run show:db`          | Open `data/app.db` using a separately installed `sqlitebrowser`.                                                                    |

## Project structure

```text
app.ts                        Express application factory and HTTP routes
server.ts                     Database initialization and listening entry point
backend/
  auth.ts                     Password hashing and session lifecycle
  API.ts                      Exports the domain API functions
  api/                        Items, courses, settings, imports, guarded downloads
  db/                         SQLite initialization and table operations
  error/                      Application errors and HTTP status mapping
  types/                      Weekday and time-of-day helpers
frontend/
  index.html                  Vite HTML entry point
  src/
    App.tsx                   Dashboard and modal composition
    api.ts                    HTTP client
    useStore.ts               Source items, groups, mutations, refresh revision
    useOccurrences.ts         Per-view occurrence loading and stale-request protection
    settings.ts               University settings state
    components/               Home, calendar, forms, navigation, and detail views
public/login/                 Login/register HTML, CSS, and TypeScript
test/backend/                Authentication, items, imports, download, and HTTP tests
test/frontend/               React interactions and occurrence-query tests
data/                         Local SQLite database and WAL files
dist/                        Generated TypeScript and dashboard output
DATABASE_SCHEMA_ERD.md        Current schema, relationships, and storage semantics
database_schema.sql           Standalone schema for a fresh database
```

## HTTP API

Routes are defined in [app.ts](app.ts); domain behavior is in [backend/api](backend/api). JSON endpoints return `{ "success": true, ... }` or an error `{ "success": false, "error": "..." }` with an appropriate HTTP status. API routes require a valid `SID` session cookie. Item, course, and subscription IDs are numeric; user and session IDs are UUID strings.

### Authentication and pages

| Method | Path          | Behavior                                                                               |
| ------ | ------------- | -------------------------------------------------------------------------------------- |
| `GET`  | `/`           | Redirect to the dashboard or login according to session validity.                      |
| `GET`  | `/login/`     | Serve login/register UI, or redirect an authenticated user.                            |
| `POST` | `/register/`  | Register with `{ username, password }`; returns the user ID and a login redirect.      |
| `POST` | `/login/`     | Authenticate with `{ username, password }`; set `SID` and return a dashboard redirect. |
| `GET`  | `/logout/`    | Invalidate the session, clear the cookie, and return a root redirect.                  |
| `GET`  | `/dashboard/` | Serve the built dashboard after checking the session.                                  |

Usernames are lowercased. Passwords require at least eight characters, an uppercase letter, a lowercase letter, and a number. Passwords are salted and hashed with PBKDF2. The session cookie is HttpOnly, applies to `/`, and expires after 24 hours.

### Items, groups, and settings

| Method   | Path                              | Behavior / request                                                                                                                                                                                           |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/api/items`                      | Return source `items`, including recurrence and completion data.                                                                                                                                             |
| `POST`   | `/api/items`                      | Create a manual item using the payload described below.                                                                                                                                                      |
| `PUT`    | `/api/items/:id`                  | Update a manual item; imported items return HTTP 409.                                                                                                                                                        |
| `DELETE` | `/api/items/:id`                  | Delete an owned manual or imported item.                                                                                                                                                                     |
| `GET`    | `/api/items/occurrences`          | Expand `items` for `?from=<ISO>&to=<ISO>`; starts fall in the half-open range `[from, to)`.                                                                                                                  |
| `PATCH`  | `/api/items/:id/completion`       | Set completion using `{ completed: boolean, start?: ISO }`.                                                                                                                                                  |
| `GET`    | `/api/courses`                    | Return owned `courses` as database-shaped rows. The UI calls these groups.                                                                                                                                   |
| `POST`   | `/api/courses`                    | Create with `{ name, code?, color? }`.                                                                                                                                                                       |
| `PUT`    | `/api/courses/:id`                | Update supplied `{ name?, code?, color? }` fields.                                                                                                                                                           |
| `DELETE` | `/api/courses/:id`                | Delete the course and its saved outline; its items remain with no course association.                                                                                                                        |
| `GET`    | `/api/courses/:id/outline`        | Return the owned course’s saved `outline`, or `null`.                                                                                                                                                        |
| `PUT`    | `/api/courses/:id/outline`        | Fetch and save a UNSW outline from `{ url, allowCodeMismatch? }`; return `outline` and a persisted review `draft`. A code mismatch returns 409 until explicitly accepted. No planner items are changed.      |
| `GET`    | `/api/courses/:id/outline/draft`  | Return the current persisted review draft, or `null`.                                                                                                                                                        |
| `POST`   | `/api/courses/:id/outline/commit` | Apply user-reviewed candidate edits from `{ draftId, candidates }` once; stale or already committed drafts return 409. Confirmed timed deadlines and bounded weekly-series occurrences become planner tasks. |
| `POST`   | `/api/courses/:id/outline/sync`   | Compatibility read for a saved outline and draft; does not change planner items.                                                                                                                             |
| `GET`    | `/api/settings`                   | Return `settings.university`; defaults are supplied for an unsaved user.                                                                                                                                     |
| `PUT`    | `/api/settings`                   | Save `{ university: { termSystem, termDates, flexWeek } }`.                                                                                                                                                  |

Manual create/update payloads share `recurrence`, `title`, and optional `courseId`, `description`, `location`, and `timezone`:

- `ONE_TIME`: supply `start_date` and `end_date` as ISO datetimes.
- `RECURRING`: supply `start_date`, at least one `daysOfWeek` value such as `MONDAY`, and `start_time`/`end_time` objects `{ hour, minute }`. Optional `end_date` bounds the series. The service generates a weekly RRULE.

For one-time completion, omit `start`. For recurring completion, provide the exact UTC `start` returned for that occurrence; the server validates it against the series. The occurrence API returns sorted concrete `start`/`end` timestamps, completion, and display metadata.

University `termSystem` is `SEMESTER` or `TRIMESTER`. `termDates` contains two or three `{ start: { day, month }, end: { day, month } }` periods respectively; zero denotes an unset day/month. Defaults are semester, two unset periods, and flex week 6.

### Calendar subscriptions

| Method   | Path                        | Behavior / request                                                                          |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| `GET`    | `/api/ical`                 | Return saved `icals`.                                                                       |
| `POST`   | `/api/ical/`                | Save a subscription with `{ url }`; this alone does not download events.                    |
| `GET`    | `/api/ical/:icalId`         | Return one owned subscription as `ical`.                                                    |
| `PUT`    | `/api/ical/:icalId`         | Update `{ url?, active? }` without fetching events.                                         |
| `DELETE` | `/api/ical/:icalId`         | Delete the subscription and its imported items/completions.                                 |
| `POST`   | `/api/ical/preview`         | Fetch `{ url }` and return a `preview` of parsed events and proposed courses; save nothing. |
| `POST`   | `/api/ical/import`          | Commit `{ url, courseDecisions, events }` from the review step.                             |
| `POST`   | `/api/ical/:icalId/refresh` | Fetch the saved feed and sync its events without the review step.                           |

A course decision contains `key`, `include`, `name`, optional `code`/`color`, and an optional numeric `courseId` belonging to the user. Import and refresh return `result` with `createdCourses`, `importedEvents`, `updated`, and `skipped` counts. Writes are transactional.

Each VEVENT series is stored as one item. Refresh matches its feed UID within the subscription and updates it in place. It preserves one-time completion and recurring completion records; switching between one-time and recurring clears incompatible completion state. An individually deleted imported item may be recreated by a later refresh.

Preview and refresh use the same guarded downloader:

- HTTP and HTTPS are supported; `webcal://` is converted to HTTPS.
- Embedded credentials and non-public destinations are rejected, including DNS answers containing private addresses. Connections use a validated address, with each redirect checked again.
- At most three redirects, ten seconds total including DNS/body transfer, and a 5 MiB response are allowed.
- Requests ask for uncompressed content; compressed responses are rejected.

Private-network calendars are unsupported. Feed URLs may contain tokens: request logs omit query strings, and download errors do not expose raw network messages.

## Database

The runtime schema is defined in [backend/db/connection.ts](backend/db/connection.ts). The database has eleven tables: `users`, `sessions`, `courses`, `course_outlines`, `course_outline_import_drafts`, `course_outline_items`, `icals`, `items`, `completions`, `settings`, and `settings_term_dates`.

See [DATABASE_SCHEMA_ERD.md](DATABASE_SCHEMA_ERD.md) for relationships and field semantics, and [database_schema.sql](database_schema.sql) for the matching fresh-database DDL. The application initializes tables directly in TypeScript; it does not load the SQL file. There are no study-log tables or explicit performance indexes in the current initializer.

## Validation

### Standalone UNSW outline preview

An isolated deterministic extractor in `backend/api/unswOutline.ts` reads UNSW public course
outlines without AI or database access. The course dashboard uses a separate
`courseOutlines.ts` service to fetch and persist results through authenticated
course routes. OpenRouter suggestions are advisory and checked against supplied source evidence; both deterministic and AI candidates require review before planner changes. The standalone inspector remains available. Inspect the captured
COMP9331 outline with:

```bash
npx tsx scripts/inspectUnswOutline.ts --fixture test/fixtures/unsw/comp9331-2026-t3.json
```

Add `--json` for structured output or use `--url '<full UNSW outline URL>'` instead
of `--fixture` to fetch a current outline. See [the inspection guide](docs/unsw-outline.md)
for supported date formats, source evidence, limitations, and expected results.

### Application checks

```bash
npm test
npm run build
```

Backend tests cover authentication, recurrence/DST behavior, completion, import integrity, guarded downloads, and HTTP routes. React tests cover imported-item controls, independent Home/Calendar ranges, stale responses, retries, and completion without loading flashes or scroll resets. Tests use isolated databases, controlled network fixtures, and temporary loopback servers; they do not use `data/app.db` or require external calendar services.

## Current limitations

- Subscription `active` is stored and exposed in the UI, but occurrence queries and manual refresh do not currently enforce it. There is no automatic background feed refresh.
- Refresh adds or updates supplied events; it does not remove previously imported events that disappear from a feed.
- Per-occurrence iCal overrides (`RECURRENCE-ID`) are not applied. Recurrence exceptions are currently interpreted by local day, and extra dates use the series' time-of-day.
- Study-time tracking, analytics, and collaboration are not implemented.
