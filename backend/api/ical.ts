import * as nodeIcal from 'node-ical';
import type { ParameterValue, VEvent } from 'node-ical';

import AppError from '../error/appError';
import { ERRORS } from '../error/errors';
import { getSQLiteDB } from '../db/connection';
import { getCoursesByUID, createCourseRow } from '../db/courses';
import { createItemRow, getItemsBySourceUid, updateItemById, ItemRow } from '../db/items';
import { getIcalsByUID, createIcalRow, updateIcalById } from '../db/icals';
import { requireUser } from './helpers';

// ---------------------------------------------------------------------------
// Parsing: fetch an iCal feed and normalise its VEVENTs into item series.
// ---------------------------------------------------------------------------

/**
 * A single VEVENT series from an iCal feed. Recurring VEVENTs are kept as ONE entry
 * carrying their raw RRULE (plus EXDATE/RDATE) rather than being expanded into
 * occurrences, so term breaks, intervals, and bounds are preserved faithfully and
 * can be expanded at read time. `start`/`end` are the master occurrence's datetimes
 * (the RRULE anchor and its duration).
 */
export interface ParsedICalEvent {
    /** The iCal VEVENT UID — the stable identity used to de-duplicate re-imports. */
    sourceUid: string;
    summary: string;
    description?: string;
    location?: string;
    start: string; // ISO-8601
    end: string; // ISO-8601
    /** Course code detected in the summary/description, e.g. "COMP1010". */
    detectedCode?: string;
    /** Human-friendly course name, used as a default when creating the course. */
    detectedName?: string;
    /** Raw RRULE value (e.g. "FREQ=WEEKLY;INTERVAL=1;UNTIL=..."); absent for one-time events. */
    rrule?: string;
    /** Excluded occurrence datetimes (ISO-8601) — term breaks, holidays. */
    exdate?: string[];
    /** Extra one-off occurrence datetimes (ISO-8601) added by the feed. */
    rdate?: string[];
}

/** Course code like "COMP1010", "CS 201", "MATH-1001A". */
const COURSE_CODE_RE = /\b([A-Za-z]{2,4})\s?-?\s?(\d{3,4}[A-Za-z]?)\b/;

// Class-type words that follow the course name in a summary/description
// ("MATH1081 Discrete Mathematics Lecture A"); we cut the name before them.
const CLASS_TYPE_RE =
    /\b(lecture|tutorial|workshop|seminar|laborator(?:y|ies)|lab|practical|exam(?:ination)?|class|studio|consultation|drop[- ]?in|meeting)\b/i;

/** Extract a course code and a friendly name from an event summary. */
export function detectCourse(summary: string): { code?: string; name?: string } {
    const text = (summary || '').trim();
    if (!text) return {};

    const match = text.match(COURSE_CODE_RE);
    if (!match) return { name: text };

    const code = `${match[1]}${match[2]}`.toUpperCase().replace(/\s|-/g, '');
    // Drop the code itself and common separators to leave a readable name.
    const name = text
        .replace(match[0], ' ')
        .replace(/[-–—:|()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return { code, name: name || code };
}

/** A clean course name from a string: strip the code, then cut at the class type. */
function refineName(source: string | undefined): string | undefined {
    if (!source) return undefined;
    let s = source.replace(COURSE_CODE_RE, ' ');
    const m = s.match(CLASS_TYPE_RE);
    if (m && m.index !== undefined && m.index > 0) {
        s = s.slice(0, m.index);
    }
    s = s.replace(/[-–—:|()]/g, ' ').replace(/\s+/g, ' ').trim();
    return s || undefined;
}

/** Best-effort course code + name, preferring the fuller DESCRIPTION for the name. */
export function detectCourseFrom(summary: string, description?: string): { code?: string; name?: string } {
    const primary = detectCourse(summary);
    const code = primary.code || (description ? detectCourse(description).code : undefined);
    const name = refineName(description) || refineName(summary) || primary.name || code;
    return { code, name };
}

/** Flatten node-ical's `string | { val }` property shape to a plain string. */
function text(value: ParameterValue | undefined): string {
    if (value == null) return '';
    return typeof value === 'string' ? value : String(value.val ?? '');
}

/**
 * Validate an iCal URL and return a fetchable http(s) form. webcal:// is rewritten
 * to https:// here — the URL.protocol setter is a no-op when converting between a
 * non-special scheme (webcal) and a special one (https), so we rewrite the string.
 */
export function normalizeICalUrl(url: string): string {
    let raw = (url || '').trim();
    if (/^webcal:\/\//i.test(raw)) {
        raw = 'https://' + raw.slice('webcal://'.length);
    }

    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw new AppError('That does not look like a valid URL', ERRORS.INVALID_ICAL_URL);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new AppError('The iCal link must be an http(s) or webcal URL', ERRORS.INVALID_ICAL_URL);
    }
    return parsed.toString();
}

/**
 * Download an iCal feed. Accepts http(s) and webcal URLs and validates that the body
 * actually looks like a calendar. Throws AppError on any failure.
 */
export async function fetchICS(url: string): Promise<string> {
    const target = normalizeICalUrl(url);

    let res: Response;
    try {
        res = await fetch(target, { redirect: 'follow' });
    } catch {
        throw new AppError('Could not reach that iCal link', ERRORS.ICAL_FETCH_FAILED);
    }
    if (!res.ok) {
        throw new AppError(`The iCal link responded with ${res.status}`, ERRORS.ICAL_FETCH_FAILED);
    }

    const body = await res.text();
    if (!body.includes('BEGIN:VCALENDAR')) {
        throw new AppError('That link did not return an iCal calendar', ERRORS.ICAL_PARSE_FAILED);
    }
    return body;
}

/** Pull the bare RRULE value ("FREQ=…") out of node-ical's parsed rule object. */
function extractRRule(rrule: { toString(): string }): string | undefined {
    const raw = rrule.toString();
    if (!raw) return undefined;
    // toString() may emit a DTSTART line and an RRULE line; keep only the rule value.
    const line = raw.split(/\r?\n/).find((l) => /^RRULE:/i.test(l));
    const value = (line ? line.replace(/^RRULE:/i, '') : raw).trim();
    return value || undefined;
}

/**
 * Flatten node-ical's date-keyed map (EXDATE/RDATE) into a de-duplicated list of ISO
 * strings. node-ical often stores the same exclusion under multiple keys (a date-only
 * key and a full-datetime key), so collapse by resolved instant.
 */
function collectDates(map: Record<string, Date> | undefined): string[] | undefined {
    if (!map) return undefined;
    const seen = new Set<string>();
    for (const value of Object.values(map)) {
        const date = value instanceof Date ? value : new Date(value as unknown as string);
        if (!isNaN(date.getTime())) seen.add(date.toISOString());
    }
    return seen.size ? [...seen] : undefined;
}

/**
 * Parse raw iCal text into VEVENT series. Each VEVENT becomes ONE entry: recurring
 * events carry their raw RRULE (+ EXDATE/RDATE) instead of being expanded, so the
 * feed is stored faithfully. Per-occurrence override instances (RECURRENCE-ID) and
 * zero-length markers (e.g. "Start of Term") are dropped.
 */
export function parseICSToEvents(ics: string): ParsedICalEvent[] {
    let data: nodeIcal.CalendarResponse;
    try {
        data = nodeIcal.sync.parseICS(ics);
    } catch {
        throw new AppError('Could not parse that iCal calendar', ERRORS.ICAL_PARSE_FAILED);
    }

    const events: ParsedICalEvent[] = [];
    for (const key of Object.keys(data)) {
        const comp = data[key];
        if (!comp || comp.type !== 'VEVENT') continue;
        const event = comp as VEvent;
        if (!event.start) continue;
        // Skip override instances — the master VEVENT carries the series' rule.
        if (event.recurrenceid) continue;

        const summary = text(event.summary).trim();
        const description = text(event.description).trim() || undefined;
        const location = text(event.location).trim() || undefined;
        const { code, name } = detectCourseFrom(summary, description);

        const start = event.start;
        const end = event.end ?? event.start;
        const rrule = event.rrule ? extractRRule(event.rrule) : undefined;

        // Drop zero-length markers ("Start of Term 2" etc.) — but only for non-recurring
        // events; a recurring rule anchored at an instant is still a real series.
        if (!rrule && start.getTime() === end.getTime()) continue;

        events.push({
            sourceUid: String(event.uid ?? key),
            summary,
            description,
            location,
            start: start.toISOString(),
            end: end.toISOString(),
            detectedCode: code,
            detectedName: name,
            rrule,
            exdate: collectDates(event.exdate),
            rdate: collectDates((event as { rdate?: Record<string, Date> }).rdate),
        });
    }
    return events;
}

// ---------------------------------------------------------------------------
// Import: preview an iCal feed as proposed courses, then commit the confirmed set.
// ---------------------------------------------------------------------------

/** Grouping key for events whose summary has no detectable course code. */
const UNCATEGORISED_KEY = 'UNCATEGORISED';

// Fallback palette for auto-suggested course colours (mirrors the CreateModal swatches).
const IMPORT_PALETTE = ['#6d8bff', '#ff7a90', '#3ecf8e', '#f0b429', '#b07cff', '#41d0d8', '#ff9d5c'];

/** A course the importer proposes to create or reuse, with the events grouped under it. */
export interface ProposedCourse {
    key: string;
    code?: string;
    name: string;
    suggestedColor: string;
    /** Set when an existing course already has this code. */
    matchedCourseId?: number;
    eventCount: number;
    /** How many of those events are not already imported. */
    newEventCount: number;
}

export interface ImportPreview {
    events: ParsedICalEvent[];
    proposedCourses: ProposedCourse[];
    alreadyImported: number;
}

/** The user's confirmed decision for one proposed course, sent back on commit. */
export interface CourseDecision {
    key: string;
    include: boolean;
    name: string;
    code?: string;
    color?: string;
    /** When set, events are attached to this existing course instead of a new one. */
    courseId?: number;
}

export interface ImportResult {
    createdCourses: number;
    importedEvents: number;
    /** Existing events refreshed in place on re-import (e.g. a moved or renamed class). */
    updated: number;
    skipped: number;
}

const groupingKey = (ev: ParsedICalEvent): string => ev.detectedCode || UNCATEGORISED_KEY;
const eventTitle = (ev: ParsedICalEvent): string => ev.summary?.trim() || 'Untitled';
// Time-of-day ("HH:mm:ss") sliced from an ISO-8601 datetime, matching how the items
// layer stores start_time/end_time.
const isoTimeOfDay = (iso: string): string => iso.slice(11, 19);

/** Validate the incoming URL and return its trimmed form. */
function requireIcalUrl(url: string): string {
    if (!url || typeof url !== 'string' || !url.trim()) {
        throw new AppError('An iCal URL is required', ERRORS.INVALID_ICAL_URL);
    }
    return url.trim();
}

/** Map a parsed VEVENT series onto the shared `items` columns (create and update alike). */
function itemFieldsFromEvent(ev: ParsedICalEvent, courseId: number | null) {
    const isRecurring = !!ev.rrule;
    // Recurring series store their rule + the master occurrence as the RRULE anchor
    // (start_date) and its duration (start_time/end_time); one-time events keep a
    // concrete calendar span. Read-time expansion is a follow-up.
    return {
        course_id: courseId,
        kind: 'EVENT',
        recurrence: isRecurring ? 'RECURRING' : 'ONE_TIME',
        title: eventTitle(ev),
        description: ev.description ?? null,
        location: ev.location ?? null,
        start_date: ev.start,
        end_date: ev.end,
        completed: isRecurring ? null : 0,
        start_time: isoTimeOfDay(ev.start),
        end_time: isoTimeOfDay(ev.end),
        rrule: ev.rrule ?? null,
        exdate: ev.exdate ? JSON.stringify(ev.exdate) : null,
        rdate: ev.rdate ? JSON.stringify(ev.rdate) : null,
    };
}

/**
 * Existing items imported from a subscription, keyed by their iCal VEVENT UID (empty
 * if the subscription doesn't exist yet). Used to upsert on re-import rather than
 * duplicate: a matching UID updates the row in place.
 */
function importedByUid(UID: string, icalId: number | undefined): Map<string, ItemRow> {
    const map = new Map<string, ItemRow>();
    if (icalId === undefined) return map;
    for (const item of getItemsBySourceUid(UID, icalId)) {
        if (item.ical_uid) map.set(item.ical_uid, item);
    }
    return map;
}

/**
 * Fetch and parse an iCal feed, group its events by detected course code, and match
 * each group against the user's existing courses. Persists nothing — the frontend
 * shows this as a review screen and sends confirmed decisions back to commit.
 */
export async function previewICalImport(UID: string, url: string): Promise<ImportPreview> {
    requireUser(UID);
    const trimmedUrl = requireIcalUrl(url);

    const events = parseICSToEvents(await fetchICS(trimmedUrl));
    const existingCourses = getCoursesByUID(UID);
    const imported = importedByUid(UID, getIcalsByUID(UID).find(i => i.url === trimmedUrl)?.id);

    const groups = new Map<string, ParsedICalEvent[]>();
    for (const ev of events) {
        const bucket = groups.get(groupingKey(ev));
        if (bucket) bucket.push(ev);
        else groups.set(groupingKey(ev), [ev]);
    }

    let colorIndex = 0;
    const proposedCourses: ProposedCourse[] = [];
    for (const [key, groupEvents] of groups) {
        const code = key === UNCATEGORISED_KEY ? undefined : key;
        const matched = code
            ? existingCourses.find(c => (c.course_code || '').toUpperCase() === code)
            : undefined;
        // Prefer the longest detected name in the group — usually the descriptive one.
        const name = code
            ? groupEvents.reduce((best, ev) => {
                  const candidate = ev.detectedName || '';
                  return candidate.length > best.length ? candidate : best;
              }, '') || code
            : 'Uncategorised';

        proposedCourses.push({
            key,
            code,
            name: matched?.course_name || name,
            suggestedColor: matched?.color_code || IMPORT_PALETTE[colorIndex++ % IMPORT_PALETTE.length],
            matchedCourseId: matched?.id,
            eventCount: groupEvents.length,
            newEventCount: groupEvents.filter(ev => !imported.has(ev.sourceUid)).length,
        });
    }

    const alreadyImported = events.filter(ev => imported.has(ev.sourceUid)).length;
    return { events, proposedCourses, alreadyImported };
}

/**
 * Persist a confirmed import: find-or-create the iCal subscription, create/reuse the
 * chosen courses, and store their VEVENT series as items — one row per series, keeping
 * the raw RRULE for recurring events. Existing rows (matched by iCal UID within the
 * subscription) are refreshed in place on re-import rather than duplicated.
 */
export function commitICalImport(
    UID: string,
    url: string,
    courseDecisions: CourseDecision[],
    events: ParsedICalEvent[]
): ImportResult {
    requireUser(UID);
    const trimmedUrl = requireIcalUrl(url);
    if (!Array.isArray(events) || !Array.isArray(courseDecisions)) {
        throw new AppError('Import events and course decisions are required', ERRORS.INVALID_ICAL_DATA);
    }

    const decisions = new Map(courseDecisions.map(d => [d.key, d]));
    const db = getSQLiteDB();
    const now = new Date().toISOString();

    let createdCourses = 0;
    let importedEvents = 0;
    let updated = 0;
    let skipped = 0;

    // Resolve a course id for a group, creating a new course on first use so that
    // re-imports (where every event is a duplicate) never leave empty courses behind.
    const courseIdByKey = new Map<string, number | undefined>();
    const resolveCourse = (decision: CourseDecision): number | undefined => {
        if (courseIdByKey.has(decision.key)) return courseIdByKey.get(decision.key);
        let id = decision.courseId;
        if (id === undefined) {
            id = createCourseRow({
                uid: UID,
                course_name: (decision.name || decision.code || 'Imported').trim(),
                course_code: decision.code?.trim() || undefined,
                color_code: decision.color || undefined,
                created_at: now,
            });
            createdCourses++;
        }
        courseIdByKey.set(decision.key, id);
        return id;
    };

    const run = db.transaction(() => {
        // One subscription per URL: reuse an existing row (refreshing its timestamp).
        const existing = getIcalsByUID(UID).find(i => i.url === trimmedUrl);
        let icalId: number;
        if (existing) {
            updateIcalById(UID, existing.id, { last_imported: now });
            icalId = existing.id;
        } else {
            icalId = createIcalRow({ uid: UID, url: trimmedUrl, active: 1, last_imported: now });
        }

        const imported = importedByUid(UID, icalId);
        for (const ev of events) {
            const decision = decisions.get(groupingKey(ev));
            // Skip unincluded groups and malformed series.
            if (!decision?.include || !ev.start || !ev.end) {
                skipped++;
                continue;
            }

            const existingRow = imported.get(ev.sourceUid);
            // Keep an already-imported row's course on re-import (an uncategorised group has
            // no code to match, so resolving would create a duplicate course each time);
            // only resolve/create a course for genuinely new rows.
            const courseId = existingRow ? existingRow.course_id : (resolveCourse(decision) ?? null);
            const fields = itemFieldsFromEvent(ev, courseId);

            if (existingRow) {
                // Re-import: refresh the row in place (moved room, renamed class, new EXDATE).
                updateItemById(UID, existingRow.id, fields, now);
                updated++;
            } else {
                const id = createItemRow({
                    uid: UID,
                    ...fields,
                    source_uid: icalId,
                    ical_uid: ev.sourceUid,
                    created_at: now,
                    updated_at: null,
                });
                imported.set(ev.sourceUid, { ...(fields as Partial<ItemRow>), id } as ItemRow);
                importedEvents++;
            }
        }
    });
    run();

    return { createdCourses, importedEvents, updated, skipped };
}
