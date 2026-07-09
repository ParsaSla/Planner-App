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
    date: string | null;
    start_date: string | null;
    end_date: string | null;
    completed: number | null;
    days_of_week: string | null;
    start_time: string | null;
    end_time: string | null;
    source_uid: number | null;
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
    'date',
    'start_date',
    'end_date',
    'completed',
    'days_of_week',
    'start_time',
    'end_time',
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
    date?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    completed?: number | null;
    days_of_week?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    source_uid?: number | null;
    created_at: string;
    updated_at?: string | null;
}): number {
    const db = getSQLiteDB();
    const info = db.prepare(
        `INSERT INTO items (uid, course_id, kind, recurrence, title, description, location, date, start_date, end_date, completed, days_of_week, start_time, end_time, source_uid, created_at, updated_at)
         VALUES (@uid, @course_id, @kind, @recurrence, @title, @description, @location, @date, @start_date, @end_date, @completed, @days_of_week, @start_time, @end_time, @source_uid, @created_at, @updated_at)`
    ).run({
        ...item,
        course_id: item.course_id ?? null,
        description: item.description ?? null,
        location: item.location ?? null,
        date: item.date ?? null,
        start_date: item.start_date ?? null,
        end_date: item.end_date ?? null,
        completed: item.completed ?? null,
        days_of_week: item.days_of_week ?? null,
        start_time: item.start_time ?? null,
        end_time: item.end_time ?? null,
        source_uid: item.source_uid ?? null,
        updated_at: item.updated_at ?? null,
    });
    return Number(info.lastInsertRowid);
}

export function getItemsByUID(uid: string): ItemRow[] {
    const db = getSQLiteDB();
    return db.prepare<{ uid: string }, ItemRow>('SELECT * FROM items WHERE uid = @uid ORDER BY created_at ASC').all({ uid });
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
