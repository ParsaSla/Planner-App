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

    // Pre-schema migration: the original settings table stored a single JSON blob
    // (settings_json). Drop that legacy layout so the canonical schema below recreates
    // it with the normalized columns. New databases have no settings table yet and skip this.
    const legacySettings = sqliteDB.pragma('table_info(settings)') as Array<{ name: string }>;
    if (legacySettings.length > 0 && !legacySettings.find(c => c.name === 'teaching_period_weeks')) {
        sqliteDB.exec(`
            DROP TABLE IF EXISTS settings_term_dates;
            DROP TABLE settings;
        `);
    }

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

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            uid TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            type TEXT NOT NULL,
            date TEXT,
            completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS recurring_tasks (
            id TEXT PRIMARY KEY,
            uid TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            days_of_week TEXT,
            time_hour INTEGER,
            time_minute INTEGER,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS courses (
            id TEXT PRIMARY KEY,
            uid TEXT NOT NULL,
            course_name TEXT NOT NULL,
            course_code TEXT,
            color_code TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS recurring_task_completions (
            id TEXT PRIMARY KEY,
            recurring_task_id TEXT NOT NULL,
            uid TEXT NOT NULL,
            instance_date TEXT NOT NULL,
            UNIQUE(recurring_task_id, instance_date),
            FOREIGN KEY(recurring_task_id) REFERENCES recurring_tasks(id) ON DELETE CASCADE,
            FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            uid TEXT NOT NULL,
            course_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS recurring_events (
            id TEXT PRIMARY KEY,
            uid TEXT NOT NULL,
            course_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            days_of_week TEXT,
            start_hour INTEGER,
            start_minute INTEGER,
            end_hour INTEGER,
            end_minute INTEGER,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS recurring_event_completions (
            id TEXT PRIMARY KEY,
            recurring_event_id TEXT NOT NULL,
            uid TEXT NOT NULL,
            instance_date TEXT NOT NULL,
            UNIQUE(recurring_event_id, instance_date),
            FOREIGN KEY(recurring_event_id) REFERENCES recurring_events(id) ON DELETE CASCADE,
            FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            uid TEXT PRIMARY KEY,
            teaching_period_weeks INTEGER NOT NULL,
            term_weeks INTEGER NOT NULL,
            term_system TEXT NOT NULL,
            flex_week INTEGER NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(uid) REFERENCES users(uid) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings_term_dates (
            uid TEXT NOT NULL,
            term_index INTEGER NOT NULL,
            day INTEGER NOT NULL,
            month INTEGER NOT NULL,
            PRIMARY KEY (uid, term_index),
            FOREIGN KEY(uid) REFERENCES settings(uid) ON DELETE CASCADE
        );
    `);

    // Migrate: add course_id to tasks and recurring_tasks for existing databases
    const taskCols = sqliteDB.pragma('table_info(tasks)') as Array<{ name: string }>;
    if (!taskCols.find(c => c.name === 'course_id')) {
        sqliteDB.exec('ALTER TABLE tasks ADD COLUMN course_id TEXT');
    }
    const recurringCols = sqliteDB.pragma('table_info(recurring_tasks)') as Array<{ name: string }>;
    if (!recurringCols.find(c => c.name === 'course_id')) {
        sqliteDB.exec('ALTER TABLE recurring_tasks ADD COLUMN course_id TEXT');
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
