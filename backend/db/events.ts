import crypto from 'crypto';

import { getSQLiteDB } from './connection';
import { groupInstanceDates } from './helpers';
import { OneTimeEvent, RecurringEvent, TASKS } from '../types/TaskTypes';
import { EventRow, RecurringEventRow } from '../types/DBTypes';

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

    const completionMap = groupInstanceDates(completions, c => c.recurring_event_id);

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
