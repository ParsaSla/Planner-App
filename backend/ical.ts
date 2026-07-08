import * as nodeIcal from 'node-ical';
import type { ParameterValue, VEvent } from 'node-ical';

import AppError from './error/appError';
import { ERRORS } from './error/errors';

/**
 * A single dated occurrence from an iCal feed, normalised into the planner's
 * one-time event shape. Recurring VEVENTs (RRULE) are expanded into one entry per
 * occurrence so exact dates, term breaks, and exams are preserved faithfully.
 */
export interface ParsedICalEvent {
    /** The iCal UID — combined with the start time to de-duplicate re-imports. */
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
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Cap expansion so an unbounded RRULE (no UNTIL/COUNT) can't explode. Feeds that
// bound their rules (e.g. university timetables) stop well within this window.
const MAX_HORIZON_DAYS = 400;

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
    if (!match) {
        return { name: text };
    }

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
 * Download an iCal feed. Accepts http(s) and webcal URLs; validates that the body
 * actually looks like a calendar. Throws AppError on any failure.
 */
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

/**
 * Parse raw iCal text into dated one-time events. Every VEVENT — recurring or not —
 * is expanded into its concrete occurrences; zero-length marker events (e.g.
 * "Start of Term") are dropped.
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

        const summary = text(event.summary).trim();
        const description = text(event.description).trim() || undefined;
        const location = text(event.location).trim() || undefined;
        const { code, name } = detectCourseFrom(summary, description);

        const from = new Date(event.start.getTime() - DAY_MS);
        const to = new Date(event.start.getTime() + MAX_HORIZON_DAYS * DAY_MS);
        let instances: Array<{ start?: Date; end?: Date }>;
        try {
            instances = nodeIcal.expandRecurringEvent(event, { from, to });
        } catch {
            instances = [];
        }
        // Fallback for a plain event the expander returned nothing for.
        if (instances.length === 0) {
            instances = [{ start: event.start, end: event.end ?? event.start }];
        }

        for (const inst of instances) {
            const start = inst.start;
            const end = inst.end ?? inst.start;
            if (!start || !end) continue;
            // Skip zero-length markers ("Start of Term 2" etc.) — not real time blocks.
            if (start.getTime() === end.getTime()) continue;

            events.push({
                sourceUid: String(event.uid ?? key),
                summary,
                description,
                location,
                start: start.toISOString(),
                end: end.toISOString(),
                detectedCode: code,
                detectedName: name,
            });
        }
    }
    return events;
}
