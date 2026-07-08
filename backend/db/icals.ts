import { getSQLiteDB } from './connection';

// Row shape of the `icals` table as defined in connection.ts.
export interface IcalRow {
    id: string;
    uid: string;
    url: string;
    active: number;
    last_imported: string;
}

const UPDATABLE_COLUMNS = ['url', 'active', 'last_imported'] as const;

type UpdatableColumn = typeof UPDATABLE_COLUMNS[number];
export type IcalUpdate = Partial<Record<UpdatableColumn, IcalRow[UpdatableColumn]>>;

export function createIcalRow(ical: {
    id: string;
    uid: string;
    url: string;
    active: number;
    last_imported: string;
}): void {
    const db = getSQLiteDB();
    db.prepare(
        `INSERT INTO icals (id, uid, url, active, last_imported)
         VALUES (@id, @uid, @url, @active, @last_imported)`
    ).run(ical);
}

export function getIcalsByUID(uid: string): IcalRow[] {
    const db = getSQLiteDB();
    return db.prepare<{ uid: string }, IcalRow>('SELECT * FROM icals WHERE uid = @uid ORDER BY last_imported DESC').all({ uid });
}

export function getIcalById(uid: string, icalId: string): IcalRow | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ uid: string; id: string }, IcalRow>('SELECT * FROM icals WHERE uid = @uid AND id = @id').get({ uid, id: icalId });
    return row || null;
}

export function updateIcalById(uid: string, icalId: string, updates: IcalUpdate): number {
    const columns = Object.keys(updates).filter((key): key is UpdatableColumn => (UPDATABLE_COLUMNS as readonly string[]).includes(key));
    if (columns.length === 0) {
        return 0;
    }

    const db = getSQLiteDB();
    const setClause = columns.map((column) => `${column} = @${column}`).join(', ');
    return db.prepare(
        `UPDATE icals SET ${setClause} WHERE uid = @uid AND id = @id`
    ).run({ ...updates, uid, id: icalId }).changes;
}

export function deleteIcalById(uid: string, icalId: string): number {
    const db = getSQLiteDB();
    return db.prepare('DELETE FROM icals WHERE uid = @uid AND id = @id').run({ uid, id: icalId }).changes;
}
