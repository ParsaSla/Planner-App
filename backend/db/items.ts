import { getSQLiteDB } from './connection';

// Row shape of the unified `items` table as defined in connection.ts.
export interface ItemRow {
    id: string;
    uid: string;
    course_id: string | null;
    kind: string;                // 'TASK' | 'EVENT'
    recurrence: string;          // 'ONE_TIME' | 'RECURRING'
    title: string;
    description: string | null;
    location: string | null;
    start_time: string | null;
    end_time: string | null;
    completed: number | null;
    days_of_week: string | null;
    source_uid: string | null;
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
    'start_time',
    'end_time',
    'completed',
    'days_of_week',
] as const;

type UpdatableColumn = typeof UPDATABLE_COLUMNS[number];
export type ItemUpdate = Partial<Record<UpdatableColumn, ItemRow[UpdatableColumn]>>;

export function createItemRow(item: {
    id: string;
    uid: string;
    course_id?: string | null;
    kind: string;
    recurrence: string;
    title: string;
    description?: string | null;
    location?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    completed?: number | null;
    days_of_week?: string | null;
    source_uid?: string | null;
    created_at: string;
    updated_at?: string | null;
}): void {
    const db = getSQLiteDB();
    db.prepare(
        `INSERT INTO items (id, uid, course_id, kind, recurrence, title, description, location, start_time, end_time, completed, days_of_week, source_uid, created_at, updated_at)
         VALUES (@id, @uid, @course_id, @kind, @recurrence, @title, @description, @location, @start_time, @end_time, @completed, @days_of_week, @source_uid, @created_at, @updated_at)`
    ).run({
        ...item,
        course_id: item.course_id ?? null,
        description: item.description ?? null,
        location: item.location ?? null,
        start_time: item.start_time ?? null,
        end_time: item.end_time ?? null,
        completed: item.completed ?? null,
        days_of_week: item.days_of_week ?? null,
        source_uid: item.source_uid ?? null,
        updated_at: item.updated_at ?? null,
    });
}

export function getItemsByUID(uid: string): ItemRow[] {
    const db = getSQLiteDB();
    return db.prepare<{ uid: string }, ItemRow>('SELECT * FROM items WHERE uid = @uid ORDER BY created_at ASC').all({ uid });
}

export function getItemById(uid: string, itemId: string): ItemRow | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ uid: string; id: string }, ItemRow>('SELECT * FROM items WHERE uid = @uid AND id = @id').get({ uid, id: itemId });
    return row || null;
}

export function updateItemById(uid: string, itemId: string, updates: ItemUpdate, updatedAt: string): number {
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

export function deleteItemById(uid: string, itemId: string): number {
    const db = getSQLiteDB();
    return db.prepare('DELETE FROM items WHERE uid = @uid AND id = @id').run({ uid, id: itemId }).changes;
}
