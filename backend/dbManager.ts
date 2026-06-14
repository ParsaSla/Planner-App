import fs from 'fs';
import Database from 'better-sqlite3';

import AppError from './error/appError';
import { ERRORS } from './error/errors';
import { DAY, TimeOfDay } from './types/GeneralTypes';
import { OneTimeTask, RecurringTask, Task, TASKS } from './types/TaskTypes';
import { UserRow, SessionRow, TaskRow, RecurringTaskRow } from './types/DBTypes';

const DEFAULT_SQLITE_DB_PATH = 'data/app.db';
let sqliteDB: Database.Database | null = null;
let sqliteDbPath = DEFAULT_SQLITE_DB_PATH;

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
    sqliteDbPath = dbPath;
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

export function createUserRow(user: UserRow): void {
    const db = getSQLiteDB();
    db.prepare(
        `INSERT OR REPLACE INTO users (uid, username, password_hash, salt, created_at, last_login)
         VALUES (@uid, @username, @password_hash, @salt, @created_at, @last_login)`
    ).run({
        ...user,
        last_login: user.last_login ?? null,
    });
}

export function updateUserLastLogin(uid: string, lastLogin: string): void {
    const db = getSQLiteDB();
    db.prepare('UPDATE users SET last_login = @last_login WHERE uid = @uid').run({ uid, last_login: lastLogin });
}

export function getUserByUsername(username: string): UserRow | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ username: string }, UserRow>('SELECT * FROM users WHERE username = @username').get({ username });
    return row || null;
}

export function getUserByUID(uid: string): UserRow | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ uid: string }, UserRow>('SELECT * FROM users WHERE uid = @uid').get({ uid });
    return row || null;
}

export function createSession(sid: string, uid: string, expires: string): void {
    const db = getSQLiteDB();
    db.prepare('INSERT OR REPLACE INTO sessions (sid, uid, expires) VALUES (@sid, @uid, @expires)').run({ sid, uid, expires });
}

export function getSession(sid: string): SessionRow | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ sid: string }, SessionRow>('SELECT * FROM sessions WHERE sid = @sid').get({ sid });
    return row || null;
}

export function deleteSession(sid: string): void {
    const db = getSQLiteDB();
    db.prepare('DELETE FROM sessions WHERE sid = @sid').run({ sid });
}

function mapOneTimeTaskRow(row: TaskRow): OneTimeTask {
    return {
        id: row.id,
        title: row.title,
        description: row.description || undefined,
        type: TASKS.ONE_TIME,
        date: new Date(row.date || ''),
        completed: Boolean(row.completed),
    };
}

function mapRecurringTaskRow(row: RecurringTaskRow): RecurringTask {
    return {
        id: row.id,
        title: row.title,
        description: row.description || undefined,
        type: TASKS.RECURRING,
        days: row.days_of_week ? JSON.parse(row.days_of_week) : [],
        time: {
            hour: row.time_hour ?? 0,
            minute: row.time_minute ?? 0,
        },
    };
}

export function createOneTimeTaskRow(task: {
    id: string;
    uid: string;
    title: string;
    description?: string;
    type: string;
    date: string;
    completed: number;
    created_at: string;
}): void {
    const db = getSQLiteDB();
    db.prepare(
        `INSERT INTO tasks (id, uid, title, description, type, date, completed, created_at)
         VALUES (@id, @uid, @title, @description, @type, @date, @completed, @created_at)`
    ).run(task);
}

export function createRecurringTaskRow(task: {
    id: string;
    uid: string;
    title: string;
    description?: string;
    days_of_week: string;
    time_hour: number;
    time_minute: number;
    active: number;
    created_at: string;
}): void {
    const db = getSQLiteDB();
    db.prepare(
        `INSERT INTO recurring_tasks (id, uid, title, description, days_of_week, time_hour, time_minute, active, created_at)
         VALUES (@id, @uid, @title, @description, @days_of_week, @time_hour, @time_minute, @active, @created_at)`
    ).run(task);
}

export function getOneTimeTasksByUID(uid: string): OneTimeTask[] {
    const db = getSQLiteDB();
    const rows = db.prepare<{ uid: string }, TaskRow>('SELECT * FROM tasks WHERE uid = @uid').all({ uid });
    return rows.map(mapOneTimeTaskRow);
}

export function getRecurringTasksByUID(uid: string): RecurringTask[] {
    const db = getSQLiteDB();
    const rows = db.prepare<{ uid: string }, RecurringTaskRow>('SELECT * FROM recurring_tasks WHERE uid = @uid').all({ uid });
    return rows.map(mapRecurringTaskRow);
}

export function deleteTaskById(uid: string, taskId: string): number {
    const db = getSQLiteDB();
    const deletedTasks = db.prepare('DELETE FROM tasks WHERE uid = @uid AND id = @id').run({ uid, id: taskId }).changes;
    const deletedRecurring = db.prepare('DELETE FROM recurring_tasks WHERE uid = @uid AND id = @id').run({ uid, id: taskId }).changes;
    return deletedTasks + deletedRecurring;
}

export function updateOneTimeTaskCompletion(uid: string, taskId: string, completed: number): number {
    const db = getSQLiteDB();
    const result = db.prepare(
        'UPDATE tasks SET completed = @completed, updated_at = @updated_at WHERE uid = @uid AND id = @id'
    ).run({
        uid,
        id: taskId,
        completed,
        updated_at: new Date().toISOString(),
    });

    return result.changes;
}

export function updateOneTimeTaskRow(uid: string, taskId: string, title: string, description: string | undefined, date: string): number {
    const db = getSQLiteDB();
    const result = db.prepare(
        `UPDATE tasks
         SET title = @title,
             description = @description,
             date = @date,
             updated_at = @updated_at
         WHERE uid = @uid AND id = @id`
    ).run({
        uid,
        id: taskId,
        title,
        description: description ?? null,
        date,
        updated_at: new Date().toISOString(),
    });

    return result.changes;
}

export function updateRecurringTaskRow(
    uid: string,
    taskId: string,
    title: string,
    description: string | undefined,
    days_of_week: string,
    time_hour: number,
    time_minute: number
): number {
    const db = getSQLiteDB();
    const result = db.prepare(
        `UPDATE recurring_tasks
         SET title = @title,
             description = @description,
             days_of_week = @days_of_week,
             time_hour = @time_hour,
             time_minute = @time_minute,
             updated_at = @updated_at
         WHERE uid = @uid AND id = @id`
    ).run({
        uid,
        id: taskId,
        title,
        description: description ?? null,
        days_of_week,
        time_hour,
        time_minute,
        updated_at: new Date().toISOString(),
    });

    return result.changes;
}
