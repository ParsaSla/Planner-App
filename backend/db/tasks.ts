import crypto from 'crypto';

import { getSQLiteDB } from './connection';
import { groupInstanceDates } from './helpers';
import { OneTimeTask, RecurringTask, TASKS } from '../types/TaskTypes';
import { TaskRow, RecurringTaskRow } from '../types/DBTypes';

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

    const completionMap = groupInstanceDates(completions, c => c.recurring_task_id);

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
