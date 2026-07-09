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
        -- ONE_TIME rows use start_time/end_time (absolute ISO datetimes) and completed.
        -- RECURRING rows use days_of_week + start_hour/minute (+ end_hour/minute for events),
        -- and per-occurrence completion is tracked in the completions table.
        -- EVENT rows carry an end (end_time / end_hour+end_minute); TASK rows leave it NULL.

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
            title TEXT NOT NULL,
            description TEXT,
            location TEXT,
            date TEXT,                             -- ONE_TIME: calendar date (YYYY-MM-DD)
            start_date TEXT,                       -- ONE_TIME: task due datetime / event start (ISO-8601)
            end_date TEXT,                         -- ONE_TIME event end (ISO-8601); NULL for tasks
            completed INTEGER,                     -- ONE_TIME only
            days_of_week TEXT,                     -- RECURRING: JSON array of day names
            start_time TEXT,                        -- RECURRING: ISO time string (HH:mm:ss)
            end_time TEXT,                          -- RECURRING: ISO time string (HH:mm:ss)
            source_uid INTEGER REFERENCES icals(id) ON DELETE CASCADE,  -- iCal subscription id; NULL for manual rows
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
