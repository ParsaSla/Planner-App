import { getSQLiteDB } from './connection';
import { SettingsRow, SettingsTermDateRow } from '../types/DBTypes';

export function getSettingsByUID(uid: string): (SettingsRow & { term_start_dates: SettingsTermDateRow[] }) | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ uid: string }, SettingsRow>('SELECT * FROM settings WHERE uid = @uid').get({ uid });
    if (!row) {
        return null;
    }
    const termDates = db.prepare<{ uid: string }, SettingsTermDateRow>(
        'SELECT * FROM settings_term_dates WHERE uid = @uid ORDER BY term_index ASC'
    ).all({ uid });
    return { ...row, term_start_dates: termDates };
}

export function upsertSettings(settings: {
    uid: string;
    teaching_period_weeks: number;
    term_weeks: number;
    term_system: string;
    flex_week: number;
    term_start_dates: Array<{ day: number; month: number }>;
}): void {
    const db = getSQLiteDB();
    const upsert = db.transaction(() => {
        db.prepare(
            `INSERT INTO settings (uid, teaching_period_weeks, term_weeks, term_system, flex_week, updated_at)
             VALUES (@uid, @teaching_period_weeks, @term_weeks, @term_system, @flex_week, @updated_at)
             ON CONFLICT(uid) DO UPDATE SET
                teaching_period_weeks = @teaching_period_weeks,
                term_weeks = @term_weeks,
                term_system = @term_system,
                flex_week = @flex_week,
                updated_at = @updated_at`
        ).run({
            uid: settings.uid,
            teaching_period_weeks: settings.teaching_period_weeks,
            term_weeks: settings.term_weeks,
            term_system: settings.term_system,
            flex_week: settings.flex_week,
            updated_at: new Date().toISOString(),
        });

        db.prepare('DELETE FROM settings_term_dates WHERE uid = @uid').run({ uid: settings.uid });
        const insertTermDate = db.prepare(
            `INSERT INTO settings_term_dates (uid, term_index, day, month)
             VALUES (@uid, @term_index, @day, @month)`
        );
        settings.term_start_dates.forEach((termDate, index) => {
            insertTermDate.run({ uid: settings.uid, term_index: index, day: termDate.day, month: termDate.month });
        });
    });
    upsert();
}
