import { RRule } from 'rrule';
import { TimeOfDay, DAY, assertDaysType, assertTimeOfDayType } from '../types/GeneralTypes';
import AppError from '../error/appError';
import { ERRORS } from '../error/errors';
import {getCourseById} from '../db/courses';
import { createItemRow, getItemsByUID, deleteItemById, updateItemById, ItemUpdate, ItemRow } from '../db/items';
import { requireUser } from './helpers';


const RECURRENCE = { ONE_TIME: 'ONE_TIME', RECURRING: 'RECURRING' } as const;
type Recurrence = typeof RECURRENCE[keyof typeof RECURRENCE];

interface ItemBase {
    id: number;
    courseId?: number;
    kind: string;
    title: string;
    description?: string;
    location?: string;
    source_uid?: number;             // icals.id when imported from a subscription
    ical_uid?: string;               // source VEVENT UID; present only on iCal-imported rows
    created_at: string;
    updated_at?: string;
}

interface OneTimeItem extends ItemBase {
    recurrence: 'ONE_TIME';
    start_date: string;
    end_date: string;            
    completed: boolean;
}

interface RecurringItem extends ItemBase {
    recurrence: 'RECURRING';
    start_date: string;
    end_date?: string;
    // Selected weekdays, derived from the RRULE's BYDAY — the app-native shape the edit
    // form and the recurring-days tag speak. Empty for non-weekly iCal rules (e.g. DAILY).
    daysOfWeek: DAY[];
    // Raw recurrence rule and its exceptions. App-native weekly patterns are fully
    // described by `daysOfWeek`, but iCal series carry intervals, UNTIL bounds, non-weekly
    // frequencies and term-break exclusions that only survive in these raw fields.
    rrule?: string;
    exdate?: string[];               // excluded occurrence datetimes (ISO-8601)
    rdate?: string[];                // extra one-off occurrence datetimes (ISO-8601)
    start_time: TimeOfDay;
    end_time: TimeOfDay;
    completedDates: string[];
}

type Item = OneTimeItem | RecurringItem;

function parseTimeOfDay(time: string): TimeOfDay {
    const [hour, minute] = time.split(':').map(Number);
    return { hour, minute };
}

// Recurrence is stored as an iCal RRULE in items.rrule (unified with iCal imports), so an
// app-native weekly pattern is just FREQ=WEEKLY;BYDAY=... The API still speaks weekdays
// (`days`), so we convert on the way in and out.
const DAY_TO_BYDAY: Record<DAY, string> = {
    MONDAY: 'MO', TUESDAY: 'TU', WEDNESDAY: 'WE', THURSDAY: 'TH',
    FRIDAY: 'FR', SATURDAY: 'SA', SUNDAY: 'SU',
};
const BYDAY_TO_DAY: Record<string, DAY> = {
    MO: 'MONDAY', TU: 'TUESDAY', WE: 'WEDNESDAY', TH: 'THURSDAY',
    FR: 'FRIDAY', SA: 'SATURDAY', SU: 'SUNDAY',
};

/** Build a weekly RRULE from selected weekdays, bounded by end_date when supplied. */
function daysToRRule(days: DAY[], endDate?: string | null): string {
    const byday = days.map((d) => DAY_TO_BYDAY[d]).join(',');
    let rule = `FREQ=WEEKLY;BYDAY=${byday}`;
    if (endDate) {
        const until = new Date(endDate);
        if (!isNaN(until.getTime())) {
            // RRULE UNTIL in basic UTC form, e.g. 20260601T000000Z
            rule += `;UNTIL=${until.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '')}`;
        }
    }
    return rule;
}

/** Extract the weekdays from an RRULE's BYDAY (empty for rules without one, e.g. FREQ=DAILY). */
function rruleToDays(rrule: string): DAY[] {
    const match = /BYDAY=([^;]+)/i.exec(rrule);
    if (!match) return [];
    return match[1]
        .split(',')
        .map((code) => BYDAY_TO_DAY[code.trim().toUpperCase().replace(/^[+-]?\d+/, '')])
        .filter((d): d is DAY => !!d);
}

export function createItem(
    uid: string,
    courseID: number,
    recurrence: Recurrence,
    title: string,
    description: string,
    location: string,
    date: string,
    start_date: string,
    end_date: string,
    frequency: string,
    daysOfWeek: DAY[],
    start_time: TimeOfDay,
    end_time: TimeOfDay,
): void {
    requireUser(uid);
    if (courseID !== undefined && getCourseById(uid, courseID) === null) {
        throw new AppError('Course not found', ERRORS.COURSE_NOT_FOUND);
    } else if (recurrence !== RECURRENCE.ONE_TIME && recurrence !== RECURRENCE.RECURRING) {
        throw new AppError('Invalid recurrence type', ERRORS.INVALID_ITEM_DATA);
    } else if (!title || !title.trim()) {
        throw new AppError('Item title is required', ERRORS.INVALID_ITEM_DATA);
    }

    if (recurrence === RECURRENCE.ONE_TIME) {
        const startDateObj = new Date(start_date);
        const endDateObj = new Date(end_date);
        if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
            throw new AppError('Invalid start date format', ERRORS.INVALID_ITEM_DATA);
        }

        createItemRow({
            uid,
            course_id: courseID ?? null,
            kind: '',
            recurrence: RECURRENCE.ONE_TIME,
            title,
            description: description ?? null,
            location: location ?? null,
            start_date: startDateObj.toISOString(),
            end_date: endDateObj.toISOString(),
            completed: 0,
            start_time: null,
            end_time: null,
            source_uid: null,
            ical_uid: null,
            rrule: null,
            exdate: null,
            rdate: null,
            created_at: new Date().toISOString(),
            updated_at: null
        });
    }
    else if (recurrence === RECURRENCE.RECURRING) {
        if (!start_date || !start_time || !end_time) {
            throw new AppError('Start date and times are required for recurring items', ERRORS.INVALID_ITEM_DATA);
        }
        const startObj = new Date(start_date);
        const endObj = end_date ? new Date(end_date) : undefined;
        if (isNaN(startObj.getTime()) || (endObj && isNaN(endObj.getTime()))) {
            throw new AppError('Invalid date format', ERRORS.INVALID_ITEM_DATA);
        }
        if (endObj && endObj.getTime() < startObj.getTime()) {
            throw new AppError('End must be after start', ERRORS.INVALID_ITEM_DATA);
        }
        if (!daysOfWeek || daysOfWeek.length === 0) {
            throw new AppError('At least one day is required for recurring events', ERRORS.INVALID_ITEM_DATA);
        }
        assertDaysType(daysOfWeek);
        assertTimeOfDayType(start_time);
        assertTimeOfDayType(end_time);

        createItemRow({
            uid,
            course_id: courseID ?? null,
            kind: '',
            recurrence: RECURRENCE.RECURRING,
            title,
            description: description ?? null,
            location: location ?? null,
            start_date: startObj.toISOString(),
            end_date: endObj ? endObj.toISOString() : null,
            completed: null,
            start_time: `${start_time.hour.toString().padStart(2, '0')}:${start_time.minute.toString().padStart(2, '0')}:00`,
            end_time: `${end_time.hour.toString().padStart(2, '0')}:${end_time.minute.toString().padStart(2, '0')}:00`,
            rrule: daysToRRule(daysOfWeek, endObj ? endObj.toISOString() : null),
            exdate: null,
            rdate: null,
            source_uid: null,
            ical_uid: null,
            created_at: new Date().toISOString(),
            updated_at: null
        });
    }
}

/** Parse a stored JSON array of ISO datetimes (exdate/rdate); undefined if empty or malformed. */
function parseIsoDateList(value: string | null): string[] | undefined {
    if (!value) return undefined;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) && parsed.length ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function mapItemRowToItem(itemRow: ItemRow): Item {
    const base: ItemBase = {
        id: itemRow.id,
        courseId: itemRow.course_id !== null ? itemRow.course_id : undefined,
        kind: itemRow.kind,
        title: itemRow.title,
        description: itemRow.description ?? undefined,
        location: itemRow.location ?? undefined,
        source_uid: itemRow.source_uid !== null ? itemRow.source_uid : undefined,
        ical_uid: itemRow.ical_uid ?? undefined,
        created_at: itemRow.created_at,
        updated_at: itemRow.updated_at ?? undefined,
    };

    if (itemRow.recurrence === RECURRENCE.RECURRING) {
        return {
            ...base,
            recurrence: RECURRENCE.RECURRING,
            start_date: itemRow.start_date!,
            end_date: itemRow.end_date ?? undefined,
            daysOfWeek: itemRow.rrule ? rruleToDays(itemRow.rrule) : [],
            rrule: itemRow.rrule ?? undefined,
            exdate: parseIsoDateList(itemRow.exdate),
            rdate: parseIsoDateList(itemRow.rdate),
            start_time: parseTimeOfDay(itemRow.start_time!),
            end_time: parseTimeOfDay(itemRow.end_time!),
            completedDates: [],
        };
    }

    else if (itemRow.recurrence === RECURRENCE.ONE_TIME) {
        return {
            ...base,
            recurrence: RECURRENCE.ONE_TIME,
            start_date: itemRow.start_date!,
            end_date: itemRow.end_date!,
            completed: itemRow.completed === 1,
        };
    }

    else throw new AppError('Invalid recurrence type in database', ERRORS.INVALID_ITEM_DATA);
}

export function getItems(UID: string): Item[] {
    requireUser(UID);

    return getItemsByUID(UID).map(mapItemRowToItem);
}

export function deleteItem(UID: string, itemId: number): void {
    requireUser(UID);

    const deletedCount = deleteItemById(UID, itemId);
    if (deletedCount === 0) {
        throw new AppError('Item not found', ERRORS.ITEM_NOT_FOUND);
    }
}



export function updateItem(
    id: number,
    uid: string,
    courseID: number,
    recurrence: Recurrence,
    title: string,
    description: string,
    location: string,
    date: string,
    start_date: string,
    end_date: string,
    frequency: string,
    daysOfWeek: DAY[],
    start_time: TimeOfDay,
    end_time: TimeOfDay,
): void {
    requireUser(uid);
    if (courseID !== undefined && getCourseById(uid, courseID) === null) {
        throw new AppError('Course not found', ERRORS.COURSE_NOT_FOUND);
    } else if (recurrence !== RECURRENCE.ONE_TIME && recurrence !== RECURRENCE.RECURRING) {
        throw new AppError('Invalid recurrence type', ERRORS.INVALID_ITEM_DATA);
    } else if (!title || !title.trim()) {
        throw new AppError('Item title is required', ERRORS.INVALID_ITEM_DATA);
    }

    let updates: ItemUpdate = {};

    if (recurrence === RECURRENCE.ONE_TIME) {
        const startDateObj = new Date(start_date);
        const endDateObj = new Date(end_date);
        if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
            throw new AppError('Invalid date format', ERRORS.INVALID_ITEM_DATA);
        }

        updates = {
            course_id: courseID ?? null,
            recurrence: RECURRENCE.ONE_TIME,
            title,
            description: description ?? null,
            location: location ?? null,
            start_date: startDateObj.toISOString(),
            end_date: endDateObj.toISOString(),
            rrule: null,
            start_time: null,
            end_time: null,
        };
    } else if (recurrence === RECURRENCE.RECURRING) {
        const startDateObj = new Date(start_date);
        const endDateObj = end_date ? new Date(end_date) : undefined;
        if (isNaN(startDateObj.getTime())) {
            throw new AppError('Invalid date format', ERRORS.INVALID_ITEM_DATA);
        }
        if (endDateObj && endDateObj.getTime() < startDateObj.getTime()) {
            throw new AppError('End must be after start', ERRORS.INVALID_ITEM_DATA);
        }
        if (!daysOfWeek || daysOfWeek.length === 0) {
            throw new AppError('At least one day is required for recurring events', ERRORS.INVALID_ITEM_DATA);
        }
        assertDaysType(daysOfWeek);
        assertTimeOfDayType(start_time);
        assertTimeOfDayType(end_time);

        updates = {
            course_id: courseID ?? null,
            recurrence: RECURRENCE.RECURRING,
            title,
            description: description ?? null,
            location: location ?? null,
            start_date: startDateObj.toISOString(),
            end_date: endDateObj ? endDateObj.toISOString() : null,
            rrule: daysToRRule(daysOfWeek, endDateObj ? endDateObj.toISOString() : null),
            start_time: `${start_time.hour.toString().padStart(2, '0')}:${start_time.minute.toString().padStart(2, '0')}:00`,
            end_time: `${end_time.hour.toString().padStart(2, '0')}:${end_time.minute.toString().padStart(2, '0')}:00`,
        };
    }

    const updatedCount = updateItemById(uid, id, updates, new Date().toISOString());
    if (updatedCount === 0) {
        throw new AppError('Item not found', ERRORS.ITEM_NOT_FOUND);
    }
}

// ---------------------------------------------------------------------------
// Read-time expansion: turn stored items into concrete dated occurrences.
// ---------------------------------------------------------------------------

/**
 * A single concrete occurrence handed to the client. One-time items yield exactly one;
 * recurring items yield one per generated date within the requested window. `id` is the
 * source item's id (shared across a recurring series' occurrences), so the client can
 * still route edits/deletes back to the underlying item.
 */
export interface ItemOccurrence {
    id: number;
    courseId?: number;
    title: string;
    description?: string;
    location?: string;
    recurrence: 'ONE_TIME' | 'RECURRING';
    start: string;   // ISO-8601 datetime of this occurrence
    end: string;     // ISO-8601 datetime of this occurrence
}

/**
 * Build a UTC Date from a stored ISO date anchor and a time-of-day. Items are stored with
 * their date/time components in UTC (start_date via toISOString(), start_time as the UTC
 * HH:mm slice), so we reconstruct in UTC end-to-end to avoid a day/hour drift.
 *
 * Note: recurrence is expanded as UTC-floating. App-native items are always UTC, so this
 * is exact for them; iCal series pinned to a TZID that crosses a DST boundary can drift by
 * an hour within the window. Day-level EXDATE matching (below) keeps whole-day exclusions
 * (term breaks) correct regardless. Full TZID-aware expansion is a later follow-up.
 */
function combineDateAndTime(isoDate: string, time: TimeOfDay): Date {
    const d = new Date(isoDate);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), time.hour, time.minute, 0));
}

/** Stamp a time-of-day onto the UTC calendar day of `base`. */
function stampTime(base: Date, time: TimeOfDay): Date {
    return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), time.hour, time.minute, 0));
}

/** UTC calendar-day key (YYYY-MM-DD) of an ISO datetime, for whole-day exclusion matching. */
function utcDayKey(iso: string): string {
    return iso.slice(0, 10);
}

/**
 * Expand a user's items into concrete occurrences within the [from, to) window. One-time
 * items are included when their start falls in the window; recurring items are expanded
 * from their RRULE (honouring UNTIL), then EXDATE days are dropped and RDATE days added.
 * Results are sorted ascending by start.
 */
export function getItemOccurrences(UID: string, from: string, to: string): ItemOccurrence[] {
    requireUser(UID);

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        throw new AppError('Invalid from/to date', ERRORS.INVALID_ITEM_DATA);
    }
    if (toDate.getTime() < fromDate.getTime()) {
        throw new AppError('`to` must not be before `from`', ERRORS.INVALID_ITEM_DATA);
    }

    const inWindow = (t: number) => t >= fromDate.getTime() && t < toDate.getTime();
    const occurrences: ItemOccurrence[] = [];

    for (const item of getItemsByUID(UID).map(mapItemRowToItem)) {
        const base = {
            id: item.id,
            courseId: item.courseId,
            title: item.title,
            description: item.description,
            location: item.location,
        };

        if (item.recurrence === RECURRENCE.ONE_TIME) {
            if (inWindow(new Date(item.start_date).getTime())) {
                occurrences.push({ ...base, recurrence: 'ONE_TIME', start: item.start_date, end: item.end_date });
            }
            continue;
        }

        // RECURRING — expand the RRULE across the window.
        if (!item.rrule) continue;
        let dates: Date[];
        try {
            const options = RRule.parseString(item.rrule);
            options.dtstart = combineDateAndTime(item.start_date, item.start_time);
            dates = new RRule(options).between(fromDate, toDate, true);
        } catch {
            // A malformed rule shouldn't sink the whole calendar — skip this series.
            continue;
        }

        // Term breaks / holidays are excluded by whole day (robust to any TZID time drift);
        // RDATE adds one-off dates the base rule doesn't cover.
        const excludedDays = new Set((item.exdate ?? []).map(utcDayKey));
        for (const rd of item.rdate ?? []) {
            const t = new Date(rd).getTime();
            if (!isNaN(t) && inWindow(t)) dates.push(new Date(t));
        }

        for (const occ of dates) {
            if (!inWindow(occ.getTime())) continue;               // enforce exclusive `to`
            if (excludedDays.has(occ.toISOString().slice(0, 10))) continue;
            occurrences.push({
                ...base,
                recurrence: 'RECURRING',
                start: stampTime(occ, item.start_time).toISOString(),
                end: stampTime(occ, item.end_time).toISOString(),
            });
        }
    }

    occurrences.sort((a, b) => a.start.localeCompare(b.start));
    return occurrences;
}
