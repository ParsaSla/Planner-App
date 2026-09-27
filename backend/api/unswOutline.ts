import { DateTime } from 'luxon';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

// Standalone: importing this module never opens the database or fetches a URL.
const PAGE = 'https://www.unsw.edu.au/course-outlines/course-outline';
const ENDPOINT = 'https://courseoutlines.unsw.edu.au/v1/publicsitecourseoutlines/detail';
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

import type { OutlineOffering, OutlineWarning, OutlineLink, OutlineText, OutlineDeadline, OutlineAssessment, OutlineResult } from '../../shared/outline';
export type * from '../../shared/outline';

type DeadlineBase = Pick<OutlineDeadline, 'label' | 'raw' | 'evidence' | 'assumptions'>;

export class OutlineError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
        this.name = 'OutlineError';
    }
}

function fail(code: string, message: string): never { throw new OutlineError(code, message); }
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function string(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function scalar(value: unknown): string { return typeof value === 'number' ? String(value) : string(value); }

/** Accept only the public outline page; the fragment selects the offering. */
export function parseOutlineUrl(input: string): OutlineOffering {
    let url: URL;
    try { url = new URL(input); } catch { return fail('INVALID_URL', 'Enter a complete UNSW course outline URL.'); }
    if (url.origin !== 'https://www.unsw.edu.au' || url.username || url.password ||
        url.pathname.replace(/\/$/, '') !== '/course-outlines/course-outline') {
        fail('INVALID_URL', 'Expected the public HTTPS UNSW course outline page.');
    }
    const params = new URLSearchParams(url.hash.slice(1));
    const get = (key: string): string => {
        const values = params.getAll(key);
        if (values.length !== 1 || !values[0].trim() || values[0].length > 120 || /[\x00-\x1f]/.test(values[0])) {
            fail('INVALID_OFFERING', `The outline URL needs one valid ${key} parameter in its fragment.`);
        }
        return values[0].trim();
    };
    const year = get('year');
    const courseCode = get('courseCode').toUpperCase();
    const activityGroupId = get('activityGroupId');
    if (!/^\d{4}$/.test(year) || Number(year) < 2000 || Number(year) > 2200 ||
        !/^[A-Z]{4}\d{4}$/.test(courseCode) || !/^\d+$/.test(activityGroupId)) {
        fail('INVALID_OFFERING', 'Invalid outline year, course code, or activity group.');
    }
    return {
        year: Number(year), courseCode, activityGroupId,
        term: get('term'), deliveryMode: get('deliveryMode'), deliveryFormat: get('deliveryFormat'),
        teachingPeriod: get('teachingPeriod'), deliveryLocation: get('deliveryLocation'),
    };
}

function urls(offering: OutlineOffering): { sourceUrl: string; apiUrl: string } {
    const params = new URLSearchParams(Object.entries(offering).map(([key, value]) => [key, String(value)]));
    return { sourceUrl: `${PAGE}#${params}`, apiUrl: `${ENDPOINT}?${params}` };
}

/** Parse markup without executing it. Output is plain text, never trusted HTML. */
function readable(value: unknown): OutlineText {
    const links: OutlineLink[] = [];
    const addLink = (href: string, label: string) => {
        try {
            const url = new URL(href, PAGE);
            if (['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password &&
                !links.some(link => link.url === url.href)) links.push({ label: label.trim() || url.href, url: url.href });
        } catch { /* Malformed links remain as text. */ }
    };
    const walk = (node: DefaultTreeAdapterMap['node']): string => {
        if (node.nodeName === '#text' && 'value' in node) return node.value;
        if (!('childNodes' in node)) return '';
        const tag = 'tagName' in node ? node.tagName : '';
        if (['script', 'style', 'template', 'noscript'].includes(tag)) return '';
        const text = node.childNodes.map(walk).join('');
        if (tag === 'a' && 'attrs' in node) {
            const href = node.attrs.find(attr => attr.name === 'href')?.value;
            if (href) addLink(href, text);
        }
        if (tag === 'br') return '\n';
        if (['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return `\n${text}\n`;
        if (['td', 'th'].includes(tag)) return `${text}\t`;
        return text;
    };
    const text = walk(parseFragment(string(value))).replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    for (const match of text.matchAll(/https?:\/\/[^\s<>]+/g)) addLink(match[0].replace(/[.,;)]+$/, ''), '');
    return { text, links };
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const NAMED_DATE = /^(?:(Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?$/i;

function namedDate(text: string, year: number): { date: DateTime; inferredYear: boolean } | null {
    const match = text.trim().match(NAMED_DATE);
    if (!match) return null;
    const month = MONTHS.findIndex(name => match[3].toLowerCase() === name || match[3].toLowerCase() === name.slice(0, 3)) + 1;
    if (!month) return null;
    const date = DateTime.fromObject({ year: Number(match[4] || year), month, day: Number(match[2]) }, { zone: 'UTC' });
    if (!date.isValid || (match[1] && WEEKDAYS[date.weekday - 1] !== match[1].slice(0, 3).toLowerCase())) return null;
    return { date, inferredYear: !match[4] };
}

function extractDeadlines(
    assessment: Record<string, unknown>, label: string, path: string, offering: OutlineOffering,
    timezone: string | null, warnings: OutlineWarning[],
): OutlineDeadline[] {
    const raw = readable(assessment.integrat_duedate).text;
    const notes = readable(assessment.integrat_submissionnotes).text;
    const evidence = [{ path: `${path}.integrat_duedate`, text: string(assessment.integrat_duedate) }];
    const base: DeadlineBase = { label, raw, evidence, assumptions: [] };
    const warn = (code: string, message: string) => warnings.push({ code, path: `${path}.integrat_duedate`, message });
    const unknown = (message: string): OutlineDeadline[] => {
        warn('UNRESOLVED_DEADLINE', message);
        return [{ ...base, kind: 'unknown' }];
    };
    const dated = (date: DateTime, time: string | null, details: DeadlineBase): OutlineDeadline => {
        const localDate = date.toISODate()!;
        if (!time) return { ...details, kind: 'date', localDate };
        const datetime = DateTime.fromISO(`${localDate}T${time}`, { zone: timezone || 'UTC' });
        // Luxon shifts nonexistent DST wall times forward; do not silently accept that.
        if (!datetime.isValid || datetime.toFormat('HH:mm') !== time ||
            (timezone && datetime.getPossibleOffsets().length !== 1)) {
            warn('INVALID_LOCAL_TIME', `The time for ${details.label} is invalid or ambiguous in ${timezone}.`);
            return { ...details, kind: 'unknown' };
        }
        return { ...details, kind: 'datetime', localDate, localTime: time, timezone,
            utc: timezone ? datetime.toUTC().toISO() : null };
    };
    if (!raw) return unknown('No assessment deadline was supplied.');

    const numeric = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/i);
    if (numeric) {
        const date = DateTime.fromObject({ year: Number(numeric[3]), month: Number(numeric[2]), day: Number(numeric[1]) }, { zone: 'UTC' });
        let hour = Number(numeric[4]);
        if (!date.isValid || (numeric[4] && (Number(numeric[5]) > 59 ||
            (numeric[6] ? hour < 1 || hour > 12 : hour > 23)))) return unknown('The fixed deadline contains an invalid date or time.');
        if (numeric[6]) hour = hour % 12 + (numeric[6].toUpperCase() === 'PM' ? 12 : 0);
        return [dated(date, numeric[4] ? `${String(hour).padStart(2, '0')}:${numeric[5]}` : null, base)];
    }

    const week = raw.match(/^Week\s+(\d{1,2})\s*:\s*(.+?)\s*[-–]\s*(.+)$/i);
    if (week) {
        const start = namedDate(week[2], offering.year);
        const end = namedDate(week[3], offering.year);
        if (!start || !end || Number(week[1]) < 1 || end.date < start.date) return unknown('The teaching-week range could not be validated.');
        return [{ ...base, kind: 'week-range', week: Number(week[1]), rangeStart: start.date.toISODate()!, rangeEnd: end.date.toISODate()!,
            assumptions: start.inferredYear || end.inferredYear ? [`Year ${offering.year} taken from the course offering.`] : [] }];
    }
    if (/^(?:During (?:the )?)?(?:Final )?Exam(?:ination)? Period\.?$/i.test(raw)) {
        warn('DATE_NOT_PUBLISHED', 'Only the exam period is specified; an exact exam date is still needed.');
        return [{ ...base, kind: 'exam-period' }];
    }

    if (/^Lab\s*\d+\s*:/i.test(raw)) {
        // Deliberately narrow: an explicit list is not a weekly recurrence rule.
        const shared = notes.match(/(?:^|\.\s*)(\d{1,2}):(\d{2})\s+(?:every|each)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s+as mentioned above)?\.?$/i);
        const sharedTime = shared && Number(shared[1]) <= 23 && Number(shared[2]) <= 59 &&
            (notes.match(/\d{1,2}:\d{2}/g) || []).length === 1 && !/\b(?:except|unless)\b/i.test(notes)
            ? `${shared[1].padStart(2, '0')}:${shared[2]}` : null;
        if (!sharedTime) warn('TIME_NOT_RESOLVED', 'Lab dates have no recognised common submission time; review the submission notes.');
        const seen = new Set<string>();
        return raw.split(/[,;\n]+/).filter(part => part.trim()).map(part => {
            const match = part.trim().match(/^(Lab\s*\d+)\s*:\s*(.+)$/i);
            const details: DeadlineBase = { ...base, label: match?.[1] || label, raw: part.trim(), evidence: [...evidence], assumptions: [] };
            const parsed = match && namedDate(match[2], offering.year);
            if (!parsed || !match || seen.has(match[1].toLowerCase().replace(/\s/g, ''))) {
                warn('UNRESOLVED_DEADLINE', `Could not validate a unique lab deadline: ${part.trim()}`);
                return { ...details, kind: 'unknown' };
            }
            seen.add(match[1].toLowerCase().replace(/\s/g, ''));
            if (parsed.inferredYear) details.assumptions.push(`Year ${offering.year} taken from the course offering.`);
            if (sharedTime && shared) {
                details.evidence.push({ path: `${path}.integrat_submissionnotes`, text: string(assessment.integrat_submissionnotes) });
                if (WEEKDAYS[parsed.date.weekday - 1] !== shared[3].slice(0, 3).toLowerCase()) {
                    warn('CONFLICTING_SUBMISSION_DAY', `${details.label} does not fall on the weekday stated in the submission notes.`);
                    return { ...details, kind: 'unknown' };
                }
                details.assumptions.push(`Common time ${sharedTime} applied from the submission notes.`);
            }
            return dated(parsed.date, sharedTime, details);
        });
    }
    const single = namedDate(raw, offering.year);
    if (single) return [dated(single.date, null, { ...base,
        assumptions: single.inferredYear ? [`Year ${offering.year} taken from the course offering.`] : [] })];
    return unknown('Deadline wording is not supported; retained for review rather than guessed.');
}

/** Pure parser: no network, database, clock, or application settings access. */
export function parseOutlineResponse(
    data: unknown, offering: OutlineOffering, options: { retrievedAt?: string } = {},
): OutlineResult {
    if (!isRecord(data)) fail('INVALID_RESPONSE', 'The outline response must be an object.');
    // Revalidate callers constructing an offering directly.
    offering = parseOutlineUrl(urls(offering).sourceUrl);
    const warnings: OutlineWarning[] = [];
    const identities: Array<[keyof OutlineOffering, string]> = [
        ['courseCode', 'integrat_coursecode'], ['year', 'integrat_year'], ['term', 'integrat_term'],
        ['teachingPeriod', 'integrat_teachingperiod'], ['deliveryMode', 'integrat_deliverymode'],
        ['deliveryFormat', 'integrat_deliveryformat'], ['deliveryLocation', 'integrat_location'],
    ];
    for (const [key, field] of identities) {
        if (scalar(data[field]).toLowerCase() !== String(offering[key]).toLowerCase()) {
            fail('OFFERING_MISMATCH', `The returned ${field} does not match the requested ${key}.`);
        }
    }
    if (!string(data.integrat_coursename) || !Array.isArray(data.integrat_CO_Assessment) || !data.integrat_CO_Assessment.every(isRecord)) {
        fail('INVALID_RESPONSE', 'The outline needs a course name and an array of assessment objects.');
    }
    // The current public response has no activity-group identity field.
    warnings.push({ code: 'ACTIVITY_GROUP_UNVERIFIED', path: 'activityGroupId',
        message: 'The requested activity group is recorded in the URL, but UNSW does not echo it in the response.' });
    const timezone = offering.deliveryLocation.toLowerCase() === 'kensington' ? 'Australia/Sydney' : null;
    if (!timezone) warnings.push({ code: 'TIMEZONE_UNKNOWN', path: 'integrat_location',
        message: 'No timezone mapping exists for this location; local datetimes will have no UTC value.' });
    const schedule = { ...readable(data.integrat_scheduleinfo), tentative: /\btentative\b/i.test(string(data.integrat_scheduleinfo)) };
    if (schedule.tentative) warnings.push({ code: 'TENTATIVE_SCHEDULE', path: 'integrat_scheduleinfo',
        message: 'The schedule is labelled tentative. Its text is supporting evidence, not an authoritative deadline.' });
    const assessments = data.integrat_CO_Assessment.map((row, index): OutlineAssessment => {
        const path = `integrat_CO_Assessment[${index}]`;
        const title = readable(row.integrat_title).text;
        if (!title) fail('INVALID_RESPONSE', `Assessment ${index + 1} has no title.`);
        const weight = string(row.integrat_weight).match(/^(\d+(?:\.\d+)?)\s*%$/);
        const weightPercent = weight && Number(weight[1]) <= 100 ? Number(weight[1]) : null;
        if (weightPercent === null) warnings.push({ code: 'WEIGHT_NOT_RESOLVED', path: `${path}.integrat_weight`, message: `No valid percentage weight for ${title}.` });
        const description = readable(row.integrat_summary);
        const detail = readable(row.integrat_detail);
        const notes = readable(row.integrat_submissionnotes);
        const hurdle = readable(row.integrat_hurdlerules);
        const additional = readable(row.integrat_additionalinfo);
        const needle = /mid[\s-]*term/i.test(title) ? /mid[\s-]*term/i
            : /^Lab$/i.test(title) ? /\blab\s+\d+\b/i
                : /assignm(?:ent|nent)/i.test(title) ? /\bassignment\b/i : null;
        const scheduleEvidence = schedule.text.split(/\n+/).filter(line => needle ? needle.test(line) : line.toLowerCase().includes(title.toLowerCase()))
            .map(text => ({ path: 'integrat_scheduleinfo', text, tentative: schedule.tentative }));
        return {
            key: `assessment-${index + 1}`, title, weightPercent,
            description: [description.text, detail.text].filter(Boolean).join('\n\n'),
            submissionNotes: notes.text, hurdleRules: hurdle.text, additionalInformation: additional.text,
            learningOutcomes: Array.isArray(row.integrat_assmtclos) ? row.integrat_assmtclos.map(value => readable(value).text).filter(Boolean) : [],
            links: [description, detail, notes, hurdle, additional].flatMap(value => value.links),
            deadlines: extractDeadlines(row, title, path, offering, timezone, warnings), scheduleEvidence,
        };
    });
    const resources = ['integrat_expectedresources', 'integrat_recommenedres', 'integrat_resourcesreqd', 'integrat_handbooklink', 'integrat_timetablelink']
        .filter(field => string(data[field])).map(field => ({ field, ...readable(data[field]) }));
    const authorities = data.integrat_CO_Authority;
    if (authorities != null && (!Array.isArray(authorities) || !authorities.every(isRecord))) {
        warnings.push({ code: 'INVALID_CONTACTS', path: 'integrat_CO_Authority', message: 'Unrecognised contact data; see the raw response.' });
    }
    const contacts = (Array.isArray(authorities) ? authorities.filter(isRecord) : []).map(row => ({
        name: [readable(row.integrat_firstname).text, readable(row.integrat_lastname).text].filter(Boolean).join(' '),
        position: readable(row.integrat_position).text, email: string(row.integrat_email),
        location: readable(row.integrat_location).text, phone: string(row.integrat_phone), availability: readable(row.integrat_availability).text,
    }));
    return {
        course: { ...offering, name: readable(data.integrat_coursename).text, campus: string(data.integrat_campus) || null,
            timezone, description: readable(data.integrat_coursesummary).text },
        assessments, resources, contacts, schedule, warnings,
        provenance: { ...urls(offering), publishedOn: string(data.integrat_lastpublishedon) || null,
            retrievedAt: options.retrievedAt ?? null, rawResponse: data },
    };
}

/** Fetch only the fixed public endpoint. No credentials, redirects, or URL crawling. */
export async function fetchCourseOutline(url: string): Promise<OutlineResult> {
    const offering = parseOutlineUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(urls(offering).apiUrl, {
            signal: controller.signal, redirect: 'error', credentials: 'omit', headers: { Accept: 'application/json' },
        });
        if (!response.ok) fail('FETCH_FAILED', `UNSW returned HTTP ${response.status}. The outline may not be published.`);
        if (!response.body) fail('INVALID_RESPONSE', 'UNSW returned an empty response.');
        if (Number(response.headers.get('content-length')) > MAX_BYTES) fail('RESPONSE_TOO_LARGE', 'The outline exceeds the 5 MiB limit.');
        const chunks: Uint8Array[] = [];
        let size = 0;
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
            size += chunk.byteLength;
            if (size > MAX_BYTES) fail('RESPONSE_TOO_LARGE', 'The outline exceeds the 5 MiB limit.');
            chunks.push(chunk);
        }
        let data: unknown;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return fail('INVALID_RESPONSE', 'UNSW did not return valid JSON.'); }
        return parseOutlineResponse(data, offering, { retrievedAt: new Date().toISOString() });
    } catch (error) {
        if (error instanceof OutlineError) throw error;
        if (controller.signal.aborted) fail('FETCH_TIMEOUT', 'The UNSW outline request timed out.');
        return fail('FETCH_FAILED', 'Could not fetch the public UNSW outline.');
    } finally {
        clearTimeout(timer);
        controller.abort();
    }
}
