import { getSQLiteDB } from './connection';

// Row shape of the unified `items` table as defined in connection.ts.
export interface ItemRow {
    id: number;
    uid: string;
    course_id: number | null;
    kind: string;                // 'TASK' | 'EVENT'
    recurrence: string;          // 'ONE_TIME' | 'RECURRING'
    title: string;
    description: string | null;
    location: string | null;
    start_date: string | null;
    end_date: string | null;
    completed: number | null;
    start_time: string | null;
    end_time: string | null;
    timezone: string | null;     // IANA TZID for wall-clock/recurrence; NULL = floating/UTC
    all_day: number | null;      // 1 = all-day (date-only) event; NULL/0 = timed
    source_uid: number | null;
    ical_uid: string | null;     // iCal source VEVENT UID; NULL for manual rows
    rrule: string | null;        // iCal RECURRING: raw RRULE value; NULL otherwise
    exdate: string | null;       // iCal RECURRING: JSON array of excluded ISO datetimes
    rdate: string | null;        // iCal RECURRING: JSON array of extra ISO datetimes
    created_at: string;
    updated_at: string | null;
}

const UPDATABLE_COLUMNS = [
    'course_id',
    'kind',
    'recurrence',
    'title',
    'description',
    'location',
    'start_date',
    'end_date',
    'completed',
    'start_time',
    'end_time',
    'timezone',
    'all_day',
    'rrule',
    'exdate',
    'rdate',
] as const;

type UpdatableColumn = typeof UPDATABLE_COLUMNS[number];
export type ItemUpdate = Partial<Record<UpdatableColumn, ItemRow[UpdatableColumn]>>;

/** Inserts an item and returns its auto-assigned id. */
export function createItemRow(item: {
    uid: string;
    course_id?: number | null;
    kind: string;
    recurrence: string;
    title: string;
    description?: string | null;
    location?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    completed?: number | null;
    start_time?: string | null;
    end_time?: string | null;
    timezone?: string | null;
    all_day?: number | null;
    source_uid?: number | null;
    ical_uid?: string | null;
    rrule?: string | null;
    exdate?: string | null;
    rdate?: string | null;
    created_at: string;
    updated_at?: string | null;
}): number {
    const db = getSQLiteDB();
    const info = db.prepare(
        `INSERT INTO items (uid, course_id, kind, recurrence, title, description, location, start_date, end_date, completed, start_time, end_time, timezone, all_day, source_uid, ical_uid, rrule, exdate, rdate, created_at, updated_at)
         VALUES (@uid, @course_id, @kind, @recurrence, @title, @description, @location, @start_date, @end_date, @completed, @start_time, @end_time, @timezone, @all_day, @source_uid, @ical_uid, @rrule, @exdate, @rdate, @created_at, @updated_at)`
    ).run({
        ...item,
        course_id: item.course_id ?? null,
        description: item.description ?? null,
        location: item.location ?? null,
        start_date: item.start_date ?? null,
        end_date: item.end_date ?? null,
        completed: item.completed ?? null,
        start_time: item.start_time ?? null,
        end_time: item.end_time ?? null,
        timezone: item.timezone ?? null,
        all_day: item.all_day ?? null,
        source_uid: item.source_uid ?? null,
        ical_uid: item.ical_uid ?? null,
        rrule: item.rrule ?? null,
        exdate: item.exdate ?? null,
        rdate: item.rdate ?? null,
        updated_at: item.updated_at ?? null,
    });
    return Number(info.lastInsertRowid);
}

export function getItemsByUID(uid: string): ItemRow[] {
    const db = getSQLiteDB();
    return db.prepare<{ uid: string }, ItemRow>('SELECT * FROM items WHERE uid = @uid ORDER BY created_at ASC').all({ uid });
}

/** All items imported from a given iCal subscription (by icals.id). */
export function getItemsBySourceUid(uid: string, sourceUid: number): ItemRow[] {
    const db = getSQLiteDB();
    return db.prepare<{ uid: string; source_uid: number }, ItemRow>(
        'SELECT * FROM items WHERE uid = @uid AND source_uid = @source_uid'
    ).all({ uid, source_uid: sourceUid });
}

export function getItemById(uid: string, itemId: number): ItemRow | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ uid: string; id: number }, ItemRow>('SELECT * FROM items WHERE uid = @uid AND id = @id').get({ uid, id: itemId });
    return row || null;
}

export function updateItemById(uid: string, itemId: number, updates: ItemUpdate, updatedAt: string): number {
    const columns = Object.keys(updates).filter((key): key is UpdatableColumn => (UPDATABLE_COLUMNS as readonly string[]).includes(key));
    if (columns.length === 0) {
        return 0;
    }

    const db = getSQLiteDB();
    const setClause = columns.map((column) => `${column} = @${column}`).join(', ');
    return db.prepare(
        `UPDATE items SET ${setClause}, updated_at = @updated_at WHERE uid = @uid AND id = @id`
    ).run({ ...updates, updated_at: updatedAt, uid, id: itemId }).changes;
}

export function deleteItemById(uid: string, itemId: number): number {
    const db = getSQLiteDB();
    return db.prepare('DELETE FROM items WHERE uid = @uid AND id = @id').run({ uid, id: itemId }).changes;
}

// // Per-occurrence completion for RECURRING items lives in the `completions` table.
// // A row's presence means "this occurrence on instance_date is done".

// export interface CompletionRow {
//     item_id: string;
//     uid: string;
//     instance_date: string;
// }

// export function getCompletionsByUID(uid: string): CompletionRow[] {
//     const db = getSQLiteDB();
//     return db.prepare<{ uid: string }, CompletionRow>('SELECT * FROM completions WHERE uid = @uid').all({ uid });
// }

// /** Marks a recurring occurrence complete. Idempotent — a duplicate is a no-op. */
// export function addCompletion(uid: string, itemId: string, instanceDate: string): void {
//     const db = getSQLiteDB();
//     db.prepare(
//         `INSERT OR IGNORE INTO completions (item_id, uid, instance_date) VALUES (@item_id, @uid, @instance_date)`
//     ).run({ item_id: itemId, uid, instance_date: instanceDate });
// }

// /** Clears a recurring occurrence's completion. Returns the number of rows removed. */
// export function removeCompletion(uid: string, itemId: string, instanceDate: string): number {
//     const db = getSQLiteDB();
//     return db.prepare(
//         'DELETE FROM completions WHERE uid = @uid AND item_id = @item_id AND instance_date = @instance_date'
//     ).run({ uid, item_id: itemId, instance_date: instanceDate }).changes;
// }
