import { getSettingsByUID, upsertSettings } from '../db/settings';
import AppError from '../error/appError';
import { ERRORS } from '../error/errors';
import { requireUser } from './helpers';

interface TermDate {
    day: number;
    month: number;
}

interface TermPeriod {
    start: TermDate;
    end: TermDate;
}

interface UniversitySettings {
    termSystem: string;
    termDates: TermPeriod[];
    flexWeek: number;
}

const TERM_SYSTEMS = ['SEMESTER', 'TRIMESTER'];
const EMPTY_PERIOD: TermPeriod = { start: { day: 0, month: 0 }, end: { day: 0, month: 0 } };

// Mirrors DEFAULT_SETTINGS on the frontend — returned when a user has no saved settings yet.
const DEFAULT_UNIVERSITY_SETTINGS: UniversitySettings = {
    termSystem: 'SEMESTER',
    termDates: [{ ...EMPTY_PERIOD }, { ...EMPTY_PERIOD }],
    flexWeek: 6,
};

export function getSettings(UID: string): { university: UniversitySettings; icalUrl?: string } {
    requireUser(UID);

    const row = getSettingsByUID(UID);
    if (!row) {
        return { university: DEFAULT_UNIVERSITY_SETTINGS };
    }

    return {
        university: {
            termSystem: row.term_system,
            flexWeek: row.flex_week,
            termDates: row.term_dates.map(d => ({
                start: { day: d.start_day, month: d.start_month },
                end: { day: d.end_day, month: d.end_month },
            })),
        }
    };
}

export function saveSettings(UID: string, university: UniversitySettings): void {
    requireUser(UID);

    if (!university || typeof university !== 'object') {
        throw new AppError('University settings are required', ERRORS.INVALID_SETTINGS_DATA);
    }

    const { termSystem, termDates, flexWeek } = university;

    if (!TERM_SYSTEMS.includes(termSystem)) {
        throw new AppError('Invalid term system', ERRORS.INVALID_SETTINGS_DATA);
    }
    if (!Number.isInteger(flexWeek) || flexWeek < 1) {
        throw new AppError('Flex week must be at least 1', ERRORS.INVALID_SETTINGS_DATA);
    }
    if (!Array.isArray(termDates)) {
        throw new AppError('Term dates are required', ERRORS.INVALID_SETTINGS_DATA);
    }

    // Validates a day/month pair, returning the sanitized values. 0 = unset.
    const normalizeDate = (date: TermDate | undefined): TermDate => {
        const day = Number(date?.day) || 0;
        const month = Number(date?.month) || 0;
        if (day < 0 || day > 31 || month < 0 || month > 12) {
            throw new AppError('Invalid term date', ERRORS.INVALID_SETTINGS_DATA);
        }
        return { day, month };
    };

    // Size the stored dates to the term system (2 for semester, 3 for trimester).
    const expectedTerms = termSystem === 'TRIMESTER' ? 3 : 2;
    const normalizedDates = Array.from({ length: expectedTerms }, (_, i) => {
        const period = termDates[i] ?? EMPTY_PERIOD;
        return {
            start: normalizeDate(period.start),
            end: normalizeDate(period.end),
        };
    });

    upsertSettings({
        uid: UID,
        term_system: termSystem,
        flex_week: flexWeek,
        term_dates: normalizedDates,
    });
}
