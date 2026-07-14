import { RRule } from 'rrule';
import { DateTime } from 'luxon';
import { TimeOfDay, DAY, assertDaysType, assertTimeOfDayType } from '../types/GeneralTypes';
import AppError from '../error/appError';
import { ERRORS } from '../error/errors';
import {getCourseById} from '../db/courses';
import { createItemRow, getItemsByUID, getItemById, deleteItemById, updateItemById, ItemUpdate, ItemRow, getCompletionsByUID, addCompletion, removeCompletion } from '../db/items';
import { groupCompletedInstants } from '../db/helpers';
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
    // IANA TZID the wall-clock times / recurrence are expressed in; absent = floating/UTC.
    timezone?: string;
    // True for a date-only (all-day) event.
    allDay?: boolean;
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
    timezone?: string,
): void {
    requireUser(uid);
    if (courseID !== undefined && getCourseById(uid, courseID) === null) {
        throw new AppError('Course not found', ERRORS.COURSE_NOT_FOUND);
    } else if (recurrence !== RECURRENCE.ONE_TIME && recurrence !== RECURRENCE.RECURRING) {
        throw new AppError('Invalid recurrence type', ERRORS.INVALID_ITEM_DATA);
    } else if (!title || !title.trim()) {
        throw new AppError('Item title is required', ERRORS.INVALID_ITEM_DATA);
    }

    const tz = timezone || null;

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
            timezone: tz,
            all_day: null,
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
            timezone: tz,
            all_day: null,
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
        timezone: itemRow.timezone ?? undefined,
        allDay: itemRow.all_day === 1 ? true : undefined,
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

    // Attach per-occurrence completion (recurring) so list/smart views can show done state.
    const completedByItem = groupCompletedInstants(getCompletionsByUID(UID), (c) => String(c.item_id));
    return getItemsByUID(UID).map(mapItemRowToItem).map((item) => {
        if (item.recurrence === RECURRENCE.RECURRING) {
            item.completedDates = completedByItem.get(String(item.id)) ?? [];
        }
        return item;
    });
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
    timezone?: string,
): void {
    requireUser(uid);
    if (courseID !== undefined && getCourseById(uid, courseID) === null) {
        throw new AppError('Course not found', ERRORS.COURSE_NOT_FOUND);
    } else if (recurrence !== RECURRENCE.ONE_TIME && recurrence !== RECURRENCE.RECURRING) {
        throw new AppError('Invalid recurrence type', ERRORS.INVALID_ITEM_DATA);
    } else if (!title || !title.trim()) {
        throw new AppError('Item title is required', ERRORS.INVALID_ITEM_DATA);
    }

    const tz = timezone || null;
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
            timezone: tz,
            all_day: null,
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
            timezone: tz,
            all_day: null,
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
    start: string;   // ISO-8601 absolute UTC instant of this occurrence
    end: string;     // ISO-8601 absolute UTC instant of this occurrence
    allDay?: boolean;
    completed: boolean;   // ONE_TIME: items.completed; RECURRING: this occurrence has a completions row
}

// Expansion is timezone-aware. Each item's wall-clock time-of-day and recurrence are expressed
// in `item.timezone` (an IANA zone; UTC when absent). We generate recurrence occurrences on a
// naive wall-clock basis, then convert each back to a true UTC instant *in that zone*, so a
// weekly 9am class stays 9am local across a DST transition (its underlying instant shifts).

const MINUTES = (t: TimeOfDay) => t.hour * 60 + t.minute;
const ONE_DAY_MS = 86_400_000;

/**
 * Reinterpret an instant's wall-clock (as seen in `zone`) as a *naive* Date whose UTC fields
 * carry those wall-clock components. This is the basis RRULE expansion runs on.
 */
function toNaive(instant: Date | string, zone: string): Date {
    const dt = (typeof instant === 'string' ? DateTime.fromISO(instant, { zone: 'utc' }) : DateTime.fromJSDate(instant, { zone: 'utc' })).setZone(zone);
    return new Date(Date.UTC(dt.year, dt.month - 1, dt.day, dt.hour, dt.minute, dt.second));
}

/** Interpret a naive wall-clock Date (UTC fields) as a time in `zone` and return the true instant. */
function fromNaive(naive: Date, zone: string): Date {
    return DateTime.fromObject(
        {
            year: naive.getUTCFullYear(), month: naive.getUTCMonth() + 1, day: naive.getUTCDate(),
            hour: naive.getUTCHours(), minute: naive.getUTCMinutes(), second: naive.getUTCSeconds(),
        },
        { zone }
    ).toUTC().toJSDate();
}

/** Naive wall-clock Date for `zone`-local calendar day of `naive` stamped with `time`. */
function stampNaive(naive: Date, time: TimeOfDay): Date {
    return new Date(Date.UTC(naive.getUTCFullYear(), naive.getUTCMonth(), naive.getUTCDate(), time.hour, time.minute, 0));
}

/**
 * Expand a single item into its concrete occurrences within the [from, to) window. A ONE_TIME
 * item yields at most one (when its start falls in the window); a RECURRING item is expanded
 * from its RRULE (honouring UNTIL) in the item's timezone, then EXDATE days are dropped and
 * RDATE days added. `completed` is left `false` here — callers stamp it from the item's
 * `completed` column (ONE_TIME) or the completions table (RECURRING).
 */
function expandItem(item: Item, fromDate: Date, toDate: Date): ItemOccurrence[] {
    const inWindow = (t: number) => t >= fromDate.getTime() && t < toDate.getTime();
    const base = {
        id: item.id,
        courseId: item.courseId,
        title: item.title,
        description: item.description,
        location: item.location,
    };
    const out: ItemOccurrence[] = [];

    if (item.recurrence === RECURRENCE.ONE_TIME) {
        if (inWindow(new Date(item.start_date).getTime())) {
            out.push({ ...base, recurrence: 'ONE_TIME', start: item.start_date, end: item.end_date, allDay: item.allDay, completed: false });
        }
        return out;
    }

    // RECURRING — expand the RRULE in the item's zone.
    if (!item.rrule) return out;
    const zone = item.timezone || 'utc';
    const overnight = MINUTES(item.end_time) <= MINUTES(item.start_time);

    // Generate naive occurrences: dtstart is the anchor's zone-local wall-clock date + start_time,
    // and any UNTIL (a true UTC instant per RFC 5545) is reinterpreted onto the same naive basis.
    let naiveDates: Date[];
    try {
        const options = RRule.parseString(item.rrule);
        const anchorNaive = toNaive(item.start_date, zone);
        options.dtstart = stampNaive(anchorNaive, item.start_time);
        if (options.until) options.until = toNaive(options.until, zone);
        // Widen the query window by a day each side (in naive terms) so DST/offset shifts near the
        // edges aren't clipped; the exact instant is re-checked with inWindow below.
        const naiveFrom = new Date(toNaive(fromDate, zone).getTime() - ONE_DAY_MS);
        const naiveTo = new Date(toNaive(toDate, zone).getTime() + ONE_DAY_MS);
        naiveDates = new RRule(options).between(naiveFrom, naiveTo, true);
    } catch {
        // A malformed rule shouldn't sink the whole calendar — skip this series.
        return out;
    }

    // Term breaks / holidays are excluded by whole zone-local day; RDATE adds one-off dates.
    const excludedDays = new Set((item.exdate ?? []).map((d) => toNaive(d, zone).toISOString().slice(0, 10)));
    for (const rd of item.rdate ?? []) {
        const t = new Date(rd);
        if (!isNaN(t.getTime())) naiveDates.push(stampNaive(toNaive(t, zone), item.start_time));
    }

    for (const occNaive of naiveDates) {
        if (excludedDays.has(occNaive.toISOString().slice(0, 10))) continue;
        const startInstant = fromNaive(occNaive, zone);
        if (!inWindow(startInstant.getTime())) continue;      // enforce window on the true instant
        const endNaive = stampNaive(occNaive, item.end_time);
        if (overnight) endNaive.setUTCDate(endNaive.getUTCDate() + 1); // 22:00→02:00 spills to next day
        out.push({
            ...base,
            recurrence: 'RECURRING',
            start: startInstant.toISOString(),
            end: fromNaive(endNaive, zone).toISOString(),
            allDay: item.allDay,
            completed: false,
        });
    }
    return out;
}

/**
 * Expand a user's items into concrete occurrences within the [from, to) window, each stamped
 * with its completion state. Results are sorted ascending by start.
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

    // Completed recurring occurrences, keyed "<item_id>|<occurrence start ISO>".
    const completedSet = new Set(getCompletionsByUID(UID).map((c) => `${c.item_id}|${c.instance_start}`));

    const occurrences: ItemOccurrence[] = [];
    for (const item of getItemsByUID(UID).map(mapItemRowToItem)) {
        const occs = expandItem(item, fromDate, toDate);
        if (item.recurrence === RECURRENCE.ONE_TIME) {
            for (const occ of occs) occ.completed = item.completed;
        } else {
            for (const occ of occs) occ.completed = completedSet.has(`${occ.id}|${occ.start}`);
        }
        occurrences.push(...occs);
    }

    occurrences.sort((a, b) => a.start.localeCompare(b.start));
    return occurrences;
}

// ---------------------------------------------------------------------------
// Completion toggles.
// ---------------------------------------------------------------------------

/** Set completion on a ONE_TIME item (manual or iCal single VEVENT) via items.completed. */
export function setOneTimeCompletion(uid: string, id: number, completed: boolean): void {
    requireUser(uid);
    const row = getItemById(uid, id);
    if (!row) {
        throw new AppError('Item not found', ERRORS.ITEM_NOT_FOUND);
    }
    if (row.recurrence !== RECURRENCE.ONE_TIME) {
        throw new AppError('Item is recurring; a specific occurrence start is required', ERRORS.INVALID_ITEM_DATA);
    }
    updateItemById(uid, id, { completed: completed ? 1 : 0 }, new Date().toISOString());
}

/**
 * Set completion on a single occurrence of a RECURRING item (manual or iCal), keyed by the
 * occurrence's absolute UTC start instant. The instant is validated against real expansion so
 * a stale/bogus start is rejected loudly rather than writing a phantom completion row.
 */
export function setOccurrenceCompletion(uid: string, id: number, startISO: string, completed: boolean): void {
    requireUser(uid);
    const row = getItemById(uid, id);
    if (!row) {
        throw new AppError('Item not found', ERRORS.ITEM_NOT_FOUND);
    }
    const item = mapItemRowToItem(row);
    if (item.recurrence !== RECURRENCE.RECURRING) {
        throw new AppError('Item is not recurring; use one-time completion', ERRORS.INVALID_ITEM_DATA);
    }
    const target = new Date(startISO);
    if (isNaN(target.getTime())) {
        throw new AppError('Invalid occurrence start', ERRORS.INVALID_ITEM_DATA);
    }

    // Validate against a tight window bracketing the instant; expandItem's ±1-day naive widening
    // ensures the occurrence is generated, and inWindow re-checks the exact instant.
    const match = expandItem(item, new Date(target.getTime()), new Date(target.getTime() + 1))
        .find((o) => new Date(o.start).getTime() === target.getTime());
    if (!match) {
        throw new AppError('No occurrence of this item at the given start', ERRORS.INVALID_ITEM_DATA);
    }

    if (completed) addCompletion(uid, id, match.start);
    else removeCompletion(uid, id, match.start);
}
