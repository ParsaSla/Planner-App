import { getSQLiteDB } from './connection';
import { SettingsRow, SettingsTermDateRow } from '../types/DBTypes';

export function getSettingsByUID(uid: string): (SettingsRow & { term_dates: SettingsTermDateRow[] }) | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ uid: string }, SettingsRow>('SELECT * FROM settings WHERE uid = @uid').get({ uid });
    if (!row) {
        return null;
    }
    const termDates = db.prepare<{ uid: string }, SettingsTermDateRow>(
        'SELECT * FROM settings_term_dates WHERE uid = @uid ORDER BY term_index ASC'
    ).all({ uid });
    return { ...row, term_dates: termDates };
}

export function upsertSettings(settings: {
    uid: string;
    term_system: string;
    flex_week: number;
    term_dates: Array<{ start: { day: number; month: number }; end: { day: number; month: number } }>;
}): void {
    const db = getSQLiteDB();
    const upsert = db.transaction(() => {
        db.prepare(
            `INSERT INTO settings (uid, term_system, flex_week, updated_at)
             VALUES (@uid, @term_system, @flex_week, @updated_at)
             ON CONFLICT(uid) DO UPDATE SET
                term_system = @term_system,
                flex_week = @flex_week,
                updated_at = @updated_at`
        ).run({
            uid: settings.uid,
            term_system: settings.term_system,
            flex_week: settings.flex_week,
            updated_at: new Date().toISOString(),
        });

        db.prepare('DELETE FROM settings_term_dates WHERE uid = @uid').run({ uid: settings.uid });
        const insertTermDate = db.prepare(
            `INSERT INTO settings_term_dates (uid, term_index, start_day, start_month, end_day, end_month)
             VALUES (@uid, @term_index, @start_day, @start_month, @end_day, @end_month)`
        );
        settings.term_dates.forEach((period, index) => {
            insertTermDate.run({
                uid: settings.uid,
                term_index: index,
                start_day: period.start.day,
                start_month: period.start.month,
                end_day: period.end.day,
                end_month: period.end.month,
            });
        });
    });
    upsert();
}

/**
 * Persist the saved iCal subscription URL without disturbing the university
 * settings. Creates a settings row with safe defaults if the user has none yet.
 */
export function updateICalUrl(uid: string, icalUrl: string | null): void {
    const db = getSQLiteDB();
    db.prepare(
        `INSERT INTO settings (uid, term_system, flex_week, ical_url, updated_at)
         VALUES (@uid, @term_system, @flex_week, @ical_url, @updated_at)
         ON CONFLICT(uid) DO UPDATE SET
            ical_url = @ical_url,
            updated_at = @updated_at`
    ).run({
        uid,
        term_system: 'SEMESTER',
        flex_week: 6,
        ical_url: icalUrl,
        updated_at: new Date().toISOString(),
    });
}
