import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';

import AppError from './error/appError';
import { ERRORS } from './error/errors';
import { DAY, TimeOfDay } from './types/GeneralTypes';
import { OneTimeTask, RecurringTask, OneTimeEvent, RecurringEvent, Task, TASKS } from './types/TaskTypes';
import { UserRow, SessionRow, TaskRow, RecurringTaskRow, CourseRow, EventRow, RecurringEventRow } from './types/DBTypes';
import { Course } from './types/TaskTypes';

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
        course_id: row.course_id || undefined,
    };
}

function mapRecurringTaskRow(row: RecurringTaskRow, completedDates: string[] = []): RecurringTask {
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
        completedDates,
        course_id: row.course_id || undefined,
    };
}

export function createOneTimeTaskRow(task: {
    id: string;
    uid: string;
    course_id?: string;
    title: string;
    description?: string;
    type: string;
    date: string;
    completed: number;
    created_at: string;
}): void {
    const db = getSQLiteDB();
    db.prepare(
        `INSERT INTO tasks (id, uid, course_id, title, description, type, date, completed, created_at)
         VALUES (@id, @uid, @course_id, @title, @description, @type, @date, @completed, @created_at)`
    ).run({ ...task, course_id: task.course_id ?? null });
}

export function createRecurringTaskRow(task: {
    id: string;
    uid: string;
    course_id?: string;
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
        `INSERT INTO recurring_tasks (id, uid, course_id, title, description, days_of_week, time_hour, time_minute, active, created_at)
         VALUES (@id, @uid, @course_id, @title, @description, @days_of_week, @time_hour, @time_minute, @active, @created_at)`
    ).run({ ...task, course_id: task.course_id ?? null });
}

export function getOneTimeTasksByUID(uid: string): OneTimeTask[] {
    const db = getSQLiteDB();
    const rows = db.prepare<{ uid: string }, TaskRow>('SELECT * FROM tasks WHERE uid = @uid').all({ uid });
    return rows.map(mapOneTimeTaskRow);
}

export function getRecurringTasksByUID(uid: string): RecurringTask[] {
    const db = getSQLiteDB();
    const rows = db.prepare<{ uid: string }, RecurringTaskRow>('SELECT * FROM recurring_tasks WHERE uid = @uid').all({ uid });

    const completions = db.prepare<{ uid: string }, { recurring_task_id: string; instance_date: string }>(
        'SELECT recurring_task_id, instance_date FROM recurring_task_completions WHERE uid = @uid'
    ).all({ uid });

    const completionMap = new Map<string, string[]>();
    for (const c of completions) {
        const dates = completionMap.get(c.recurring_task_id) ?? [];
        dates.push(c.instance_date);
        completionMap.set(c.recurring_task_id, dates);
    }

    return rows.map(row => mapRecurringTaskRow(row, completionMap.get(row.id) ?? []));
}

export function setRecurringInstanceCompletion(uid: string, taskId: string, instanceDate: string, completed: boolean): void {
    const db = getSQLiteDB();
    if (completed) {
        db.prepare(
            `INSERT OR IGNORE INTO recurring_task_completions (id, recurring_task_id, uid, instance_date)
             VALUES (@id, @recurring_task_id, @uid, @instance_date)`
        ).run({ id: crypto.randomUUID(), recurring_task_id: taskId, uid, instance_date: instanceDate });
    } else {
        db.prepare(
            `DELETE FROM recurring_task_completions
             WHERE uid = @uid AND recurring_task_id = @recurring_task_id AND instance_date = @instance_date`
        ).run({ uid, recurring_task_id: taskId, instance_date: instanceDate });
    }
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

export function updateOneTimeTaskRow(uid: string, taskId: string, title: string, description: string | undefined, date: string, course_id?: string): number {
    const db = getSQLiteDB();
    const result = db.prepare(
        `UPDATE tasks
         SET title = @title,
             description = @description,
             date = @date,
             course_id = @course_id,
             updated_at = @updated_at
         WHERE uid = @uid AND id = @id`
    ).run({
        uid,
        id: taskId,
        title,
        description: description ?? null,
        date,
        course_id: course_id ?? null,
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
    time_minute: number,
    course_id?: string
): number {
    const db = getSQLiteDB();
    const result = db.prepare(
        `UPDATE recurring_tasks
         SET title = @title,
             description = @description,
             days_of_week = @days_of_week,
             time_hour = @time_hour,
             time_minute = @time_minute,
             course_id = @course_id,
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
        course_id: course_id ?? null,
        updated_at: new Date().toISOString(),
    });

    return result.changes;
}

export function createCourseRow(course: { id: string; uid: string; course_name: string; course_code?: string; color_code?: string; created_at: string }): void {
    const db = getSQLiteDB();
    db.prepare(
        `INSERT INTO courses (id, uid, course_name, course_code, color_code, created_at)
         VALUES (@id, @uid, @course_name, @course_code, @color_code, @created_at)`
    ).run({ ...course, course_code: course.course_code ?? null, color_code: course.color_code ?? null });
}

export function getCoursesByUID(uid: string): CourseRow[] {
    const db = getSQLiteDB();
    return db.prepare<{ uid: string }, CourseRow>('SELECT * FROM courses WHERE uid = @uid ORDER BY course_name ASC').all({ uid });
}

export function getCourseById(uid: string, courseId: string): CourseRow | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ uid: string; id: string }, CourseRow>('SELECT * FROM courses WHERE uid = @uid AND id = @id').get({ uid, id: courseId });
    return row || null;
}

export function deleteCourseById(uid: string, courseId: string): number {
    const db = getSQLiteDB();
    return db.prepare('DELETE FROM courses WHERE uid = @uid AND id = @id').run({ uid, id: courseId }).changes;
}

function mapOneTimeEventRow(row: EventRow): OneTimeEvent {
    return {
        id: row.id,
        title: row.title,
        description: row.description || undefined,
        type: TASKS.ONE_TIME,
        start: new Date(row.start_time || ''),
        end: new Date(row.end_time || ''),
        completed: Boolean(row.completed),
        course_id: row.course_id || undefined,
    };
}

function mapRecurringEventRow(row: RecurringEventRow, completedDates: string[] = []): RecurringEvent {
    return {
        id: row.id,
        title: row.title,
        description: row.description || undefined,
        type: TASKS.RECURRING,
        days: row.days_of_week ? JSON.parse(row.days_of_week) : [],
        startTime: {
            hour: row.start_hour ?? 0,
            minute: row.start_minute ?? 0,
        },
        endTime: {
            hour: row.end_hour ?? 0,
            minute: row.end_minute ?? 0,
        },
        completedDates,
        course_id: row.course_id || undefined,
    };
}

export function createOneTimeEventRow(event: {
    id: string;
    uid: string;
    course_id?: string;
    title: string;
    description?: string;
    start_time: string;
    end_time: string;
    completed: number;
    created_at: string;
}): void {
    const db = getSQLiteDB();
    db.prepare(
        `INSERT INTO events (id, uid, course_id, title, description, start_time, end_time, completed, created_at)
         VALUES (@id, @uid, @course_id, @title, @description, @start_time, @end_time, @completed, @created_at)`
    ).run({ ...event, course_id: event.course_id ?? null });
}

export function createRecurringEventRow(event: {
    id: string;
    uid: string;
    course_id?: string;
    title: string;
    description?: string;
    days_of_week: string;
    start_hour: number;
    start_minute: number;
    end_hour: number;
    end_minute: number;
    active: number;
    created_at: string;
}): void {
    const db = getSQLiteDB();
    db.prepare(
        `INSERT INTO recurring_events (id, uid, course_id, title, description, days_of_week, start_hour, start_minute, end_hour, end_minute, active, created_at)
         VALUES (@id, @uid, @course_id, @title, @description, @days_of_week, @start_hour, @start_minute, @end_hour, @end_minute, @active, @created_at)`
    ).run({ ...event, course_id: event.course_id ?? null });
}

export function getOneTimeEventsByUID(uid: string): OneTimeEvent[] {
    const db = getSQLiteDB();
    const rows = db.prepare<{ uid: string }, EventRow>('SELECT * FROM events WHERE uid = @uid').all({ uid });
    return rows.map(mapOneTimeEventRow);
}

export function getRecurringEventsByUID(uid: string): RecurringEvent[] {
    const db = getSQLiteDB();
    const rows = db.prepare<{ uid: string }, RecurringEventRow>('SELECT * FROM recurring_events WHERE uid = @uid').all({ uid });

    const completions = db.prepare<{ uid: string }, { recurring_event_id: string; instance_date: string }>(
        'SELECT recurring_event_id, instance_date FROM recurring_event_completions WHERE uid = @uid'
    ).all({ uid });

    const completionMap = new Map<string, string[]>();
    for (const c of completions) {
        const dates = completionMap.get(c.recurring_event_id) ?? [];
        dates.push(c.instance_date);
        completionMap.set(c.recurring_event_id, dates);
    }

    return rows.map(row => mapRecurringEventRow(row, completionMap.get(row.id) ?? []));
}

export function setRecurringEventInstanceCompletion(uid: string, eventId: string, instanceDate: string, completed: boolean): void {
    const db = getSQLiteDB();
    if (completed) {
        db.prepare(
            `INSERT OR IGNORE INTO recurring_event_completions (id, recurring_event_id, uid, instance_date)
             VALUES (@id, @recurring_event_id, @uid, @instance_date)`
        ).run({ id: crypto.randomUUID(), recurring_event_id: eventId, uid, instance_date: instanceDate });
    } else {
        db.prepare(
            `DELETE FROM recurring_event_completions
             WHERE uid = @uid AND recurring_event_id = @recurring_event_id AND instance_date = @instance_date`
        ).run({ uid, recurring_event_id: eventId, instance_date: instanceDate });
    }
}

export function deleteEventById(uid: string, eventId: string): number {
    const db = getSQLiteDB();
    const deletedEvents = db.prepare('DELETE FROM events WHERE uid = @uid AND id = @id').run({ uid, id: eventId }).changes;
    const deletedRecurring = db.prepare('DELETE FROM recurring_events WHERE uid = @uid AND id = @id').run({ uid, id: eventId }).changes;
    return deletedEvents + deletedRecurring;
}

export function updateOneTimeEventCompletion(uid: string, eventId: string, completed: number): number {
    const db = getSQLiteDB();
    const result = db.prepare(
        'UPDATE events SET completed = @completed, updated_at = @updated_at WHERE uid = @uid AND id = @id'
    ).run({
        uid,
        id: eventId,
        completed,
        updated_at: new Date().toISOString(),
    });

    return result.changes;
}

export function updateOneTimeEventRow(uid: string, eventId: string, title: string, description: string | undefined, start: string, end: string, course_id?: string): number {
    const db = getSQLiteDB();
    const result = db.prepare(
        `UPDATE events
         SET title = @title,
             description = @description,
             start_time = @start_time,
             end_time = @end_time,
             course_id = @course_id,
             updated_at = @updated_at
         WHERE uid = @uid AND id = @id`
    ).run({
        uid,
        id: eventId,
        title,
        description: description ?? null,
        start_time: start,
        end_time: end,
        course_id: course_id ?? null,
        updated_at: new Date().toISOString(),
    });

    return result.changes;
}

export function updateRecurringEventRow(
    uid: string,
    eventId: string,
    title: string,
    description: string | undefined,
    days_of_week: string,
    start_hour: number,
    start_minute: number,
    end_hour: number,
    end_minute: number,
    course_id?: string
): number {
    const db = getSQLiteDB();
    const result = db.prepare(
        `UPDATE recurring_events
         SET title = @title,
             description = @description,
             days_of_week = @days_of_week,
             start_hour = @start_hour,
             start_minute = @start_minute,
             end_hour = @end_hour,
             end_minute = @end_minute,
             course_id = @course_id,
             updated_at = @updated_at
         WHERE uid = @uid AND id = @id`
    ).run({
        uid,
        id: eventId,
        title,
        description: description ?? null,
        days_of_week,
        start_hour,
        start_minute,
        end_hour,
        end_minute,
        course_id: course_id ?? null,
        updated_at: new Date().toISOString(),
    });

    return result.changes;
}
