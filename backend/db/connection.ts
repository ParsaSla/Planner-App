import fs from 'fs';
import Database from 'better-sqlite3';

import AppError from '../error/appError';
import { ERRORS } from '../error/errors';

const DEFAULT_SQLITE_DB_PATH = 'data/app.db';
let sqliteDB: Database.Database | null = null;

function ensureDataDirectory() {
    if (!fs.existsSync('data')) {
        fs.mkdirSync('data', { recursive: true });
    }
}

function initializeSQLite(dbPath: string): void {
    if (sqliteDB) {
        return;
    }

    sqliteDB = new Database(dbPath);
    sqliteDB.pragma('journal_mode = WAL');
    sqliteDB.pragma('foreign_keys = ON');


    sqliteDB.exec(`
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

        -- Unified planner item: a task (point in time) or an event (time-blocked span),
        -- either one-time or recurring. Two discriminator columns say which:
        --   kind       = 'TASK'  | 'EVENT'
        --   recurrence = 'ONE_TIME' | 'RECURRING'
        -- ONE_TIME rows use date + start_time/end_time and completed.
        -- RECURRING rows are described by a single iCal RRULE in rrule (+ exdate/rdate),
        -- anchored by start_date/start_time; an app-native weekly pattern is just
        -- FREQ=WEEKLY;BYDAY=... Per-occurrence completion is tracked in the completions
        -- table. EVENT rows carry an end; TASK rows leave it NULL.
        --
        -- iCal import: one row per VEVENT series (recurring events keep their RRULE rather
        -- than being expanded). VEVENT property -> column mapping:
        --   UID          -> ical_uid
        --   SUMMARY      -> title
        --   DESCRIPTION  -> description
        --   LOCATION     -> location
        --   DTSTART      -> start_date (RRULE anchor) + start_time (its time-of-day); also date for ONE_TIME
        --   DTEND        -> end_date   (occurrence duration) + end_time (its time-of-day)
        --   RRULE        -> rrule
        --   EXDATE       -> exdate
        --   RDATE        -> rdate
        -- (source_uid is the icals.id of the subscription, not an iCal property.)

        CREATE TABLE IF NOT EXISTS icals (
            id INTEGER PRIMARY KEY,
            uid TEXT NOT NULL,
            url TEXT NOT NULL,
            active INTEGER NOT NULL,
            last_imported TEXT NOT NULL,
            FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY,
            uid TEXT NOT NULL,
            course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
            kind TEXT NOT NULL,
            recurrence TEXT NOT NULL,
            title TEXT NOT NULL,                   -- iCal: VEVENT SUMMARY
            description TEXT,                       -- iCal: VEVENT DESCRIPTION
            location TEXT,                          -- iCal: VEVENT LOCATION
            start_date TEXT,                       -- ONE_TIME: task due datetime / event start (ISO-8601). iCal: DTSTART (RRULE anchor)
            end_date TEXT,                         -- ONE_TIME event end (ISO-8601); NULL for tasks. iCal: DTEND
            completed INTEGER,                     -- ONE_TIME only
            start_time TEXT,                        -- RECURRING: ISO time string (HH:mm:ss). iCal: time-of-day of DTSTART
            end_time TEXT,                          -- RECURRING: ISO time string (HH:mm:ss). iCal: time-of-day of DTEND
            source_uid INTEGER REFERENCES icals(id) ON DELETE CASCADE,  -- iCal subscription id (icals.id, not a VEVENT field); NULL for manual rows
            ical_uid TEXT,                          -- iCal: VEVENT UID (stable identity within a subscription); NULL for manual rows
            rrule TEXT,                             -- RECURRING: the recurrence rule (app-native weekly = FREQ=WEEKLY;BYDAY=...; iCal = VEVENT RRULE); NULL for ONE_TIME
            exdate TEXT,                            -- iCal RECURRING: VEVENT EXDATE, JSON array of excluded ISO datetimes (term breaks / holidays)
            rdate TEXT,                             -- iCal RECURRING: VEVENT RDATE, JSON array of extra ISO datetimes
            created_at TEXT NOT NULL,
            updated_at TEXT,
            FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
        );


        CREATE TABLE IF NOT EXISTS completions (
            item_id INTEGER NOT NULL,
            uid TEXT NOT NULL,
            instance_date TEXT NOT NULL,
            PRIMARY KEY (item_id, instance_date),
            FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE,
            FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            uid TEXT PRIMARY KEY,
            term_system TEXT NOT NULL,
            flex_week INTEGER NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings_term_dates (
            uid TEXT NOT NULL,
            term_index INTEGER NOT NULL,
            start_day INTEGER NOT NULL,
            start_month INTEGER NOT NULL,
            end_day INTEGER NOT NULL,
            end_month INTEGER NOT NULL,
            PRIMARY KEY (uid, term_index),
            FOREIGN KEY(uid) REFERENCES settings(uid) ON DELETE CASCADE
        );
    `);

    migrateItemsColumns(sqliteDB);
}

// There is no migration framework — CREATE TABLE IF NOT EXISTS never alters an existing
// table. Additively backfill any iCal columns missing from an older `items` table so
// existing dev databases pick them up without a manual reset.
function migrateItemsColumns(db: Database.Database): void {
    const existing = new Set(
        db.prepare(`PRAGMA table_info(items)`).all().map((col) => (col as { name: string }).name)
    );
    const additions: Record<string, string> = {
        ical_uid: 'TEXT',
        rrule: 'TEXT',
        exdate: 'TEXT',
        rdate: 'TEXT',
    };
    for (const [name, type] of Object.entries(additions)) {
        if (!existing.has(name)) {
            db.exec(`ALTER TABLE items ADD COLUMN ${name} ${type}`);
        }
    }
    // Recurrence is now expressed as an RRULE in `rrule` (app-native weekly included), so the
    // old weekly-only `days_of_week` column is retired. Drop it from pre-existing dev DBs.
    if (existing.has('days_of_week')) {
        db.exec(`ALTER TABLE items DROP COLUMN days_of_week`);
    }
}

export function getSQLiteDB(): Database.Database {
    if (!sqliteDB) {
        throw new AppError('SQLite database is not initialized. Call initializeDB() first.', ERRORS.DATABASE_READ_ERROR);
    }
    return sqliteDB;
}

export function initializeDB(dbPath: string = DEFAULT_SQLITE_DB_PATH): void {
    if (sqliteDB) {
        sqliteDB.close();
        sqliteDB = null;
    }

    if (dbPath === DEFAULT_SQLITE_DB_PATH) {
        ensureDataDirectory();
    }

    initializeSQLite(dbPath);
}

export function closeDB(): void {
    if (sqliteDB) {
        sqliteDB.close();
        sqliteDB = null;
    }
}
