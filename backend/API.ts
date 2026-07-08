import crypto from 'crypto';

import { TimeOfDay, DAY, assertDaysType, assertTimeOfDayType } from './types/GeneralTypes';
import { assertTaskType, Course, Task, TASKS, TaskType } from './types/TaskTypes';
import AppError from './error/appError';
import { ERRORS } from './error/errors';
import { convertToDateObj } from './util';
import {
    createOneTimeTaskRow,
    createRecurringTaskRow,
    getOneTimeTasksByUID,
    getRecurringTasksByUID,
    deleteTaskById,
    updateOneTimeTaskCompletion,
    updateOneTimeTaskRow,
    updateRecurringTaskRow,
    setRecurringInstanceCompletion,
    getUserByUID,
    createCourseRow,
    getCoursesByUID,
    getCourseById,
    deleteCourseById,
    getSettingsByUID,
    upsertSettings,
    createOneTimeEventRow,
    createRecurringEventRow,
    getOneTimeEventsByUID,
    getRecurringEventsByUID,
    deleteEventById,
    updateOneTimeEventCompletion,
    updateOneTimeEventRow,
    updateRecurringEventRow,
    setRecurringEventInstanceCompletion,
    getImportedSourceKeys,
    updateICalUrl,
    getSQLiteDB,
} from './dbManager';
import { fetchICS, parseICSToEvents, ParsedICalEvent } from './ical';

/** Throws if no user exists for the given UID. */
function requireUser(UID: string): void {
    if (!getUserByUID(UID)) {
        throw new AppError('User not found', ERRORS.INVALID_CREDENTIALS);
    }
}

function createOneTimeTask(title: string, UID: string, date: Date, description?: string, courseId?: string): void {
    requireUser(UID);

    createOneTimeTaskRow({
        id: crypto.randomUUID(),
        uid: UID,
        course_id: courseId,
        title,
        description,
        type: TASKS.ONE_TIME,
        date: date.toISOString(),
        completed: 0,
        created_at: new Date().toISOString(),
    });
}

function createRecurringTask(title: string, UID: string, days: Array<DAY>, time: TimeOfDay, description?: string, courseId?: string): void {
    requireUser(UID);

    assertDaysType(days);
    assertTimeOfDayType(time);

    createRecurringTaskRow({
        id: crypto.randomUUID(),
        uid: UID,
        course_id: courseId,
        title,
        description,
        days_of_week: JSON.stringify(days),
        time_hour: time.hour,
        time_minute: time.minute,
        active: 1,
        created_at: new Date().toISOString(),
    });
}

export function createTask(type: TaskType, title: string, UID: string, date: string, days: Array<DAY>, time: TimeOfDay, description?: string, courseId?: string): void {
    assertTaskType(type);

    if (type === TASKS.ONE_TIME) {
        const dateObj = convertToDateObj(date);
        createOneTimeTask(title, UID, dateObj, description, courseId);
    } else if (type === TASKS.RECURRING) {
        assertDaysType(days);
        assertTimeOfDayType(time);
        createRecurringTask(title, UID, days, time, description, courseId);
    }
}

export function getTasks(UID: string): Task[] {
    requireUser(UID);

    return [...getOneTimeTasksByUID(UID), ...getRecurringTasksByUID(UID)];
}

export function deleteTask(UID: string, taskId: string): void {
    requireUser(UID);

    const deletedCount = deleteTaskById(UID, taskId);
    if (deletedCount === 0) {
        throw new AppError('Task not found', ERRORS.TASK_NOT_FOUND);
    }
}

export function updateTaskCompletion(UID: string, taskId: string, completed: boolean): void {
    requireUser(UID);

    const updatedCount = updateOneTimeTaskCompletion(UID, taskId, completed ? 1 : 0);
    if (updatedCount === 0) {
        throw new AppError('Task not found', ERRORS.TASK_NOT_FOUND);
    }
}

export function toggleRecurringInstance(UID: string, taskId: string, instanceDate: string, completed: boolean): void {
    requireUser(UID);
    if (!instanceDate || typeof instanceDate !== 'string') {
        throw new AppError('Instance date is required', ERRORS.INVALID_TASK_DATA);
    }
    setRecurringInstanceCompletion(UID, taskId, instanceDate, completed);
}

export function updateTask(
    UID: string,
    taskId: string,
    type: TaskType,
    title: string,
    description: string | undefined,
    date?: string,
    days?: Array<DAY>,
    time?: TimeOfDay,
    courseId?: string
): void {
    requireUser(UID);

    assertTaskType(type);
    if (!title || !title.trim()) {
        throw new AppError('Task title is required', ERRORS.INVALID_TASK_DATA);
    }

    let updatedCount = 0;

    if (type === TASKS.ONE_TIME) {
        if (!date) {
            throw new AppError('Date is required for one-time tasks', ERRORS.INVALID_TASK_DATA);
        }
        const dateObj = convertToDateObj(date);
        updatedCount = updateOneTimeTaskRow(UID, taskId, title, description, dateObj.toISOString(), courseId);
    } else {
        if (!days || days.length === 0) {
            throw new AppError('At least one day is required for recurring tasks', ERRORS.INVALID_TASK_DATA);
        }
        if (!time) {
            throw new AppError('Time is required for recurring tasks', ERRORS.INVALID_TASK_DATA);
        }
        assertDaysType(days);
        assertTimeOfDayType(time);
        updatedCount = updateRecurringTaskRow(
            UID,
            taskId,
            title,
            description,
            JSON.stringify(days),
            time.hour,
            time.minute,
            courseId
        );
    }

    if (updatedCount === 0) {
        throw new AppError('Task not found', ERRORS.TASK_NOT_FOUND);
    }
}

function createOneTimeEvent(title: string, UID: string, start: Date, end: Date, description?: string, courseId?: string): void {
    requireUser(UID);

    if (end.getTime() < start.getTime()) {
        throw new AppError('Event end must be after its start', ERRORS.INVALID_EVENT_DATA);
    }

    createOneTimeEventRow({
        id: crypto.randomUUID(),
        uid: UID,
        course_id: courseId,
        title,
        description,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        completed: 0,
        created_at: new Date().toISOString(),
    });
}

function createRecurringEvent(title: string, UID: string, days: Array<DAY>, startTime: TimeOfDay, endTime: TimeOfDay, description?: string, courseId?: string): void {
    requireUser(UID);

    assertDaysType(days);
    assertTimeOfDayType(startTime);
    assertTimeOfDayType(endTime);

    createRecurringEventRow({
        id: crypto.randomUUID(),
        uid: UID,
        course_id: courseId,
        title,
        description,
        days_of_week: JSON.stringify(days),
        start_hour: startTime.hour,
        start_minute: startTime.minute,
        end_hour: endTime.hour,
        end_minute: endTime.minute,
        active: 1,
        created_at: new Date().toISOString(),
    });
}

export function createEvent(
    type: TaskType,
    title: string,
    UID: string,
    start: string,
    end: string,
    days: Array<DAY>,
    startTime: TimeOfDay,
    endTime: TimeOfDay,
    description?: string,
    courseId?: string
): void {
    assertTaskType(type);

    if (!title || !title.trim()) {
        throw new AppError('Event title is required', ERRORS.INVALID_EVENT_DATA);
    }

    if (type === TASKS.ONE_TIME) {
        if (!start || !end) {
            throw new AppError('Start and end are required for one-time events', ERRORS.INVALID_EVENT_DATA);
        }
        const startObj = convertToDateObj(start);
        const endObj = convertToDateObj(end);
        createOneTimeEvent(title, UID, startObj, endObj, description, courseId);
    } else if (type === TASKS.RECURRING) {
        if (!days || days.length === 0) {
            throw new AppError('At least one day is required for recurring events', ERRORS.INVALID_EVENT_DATA);
        }
        if (!startTime || !endTime) {
            throw new AppError('Start and end times are required for recurring events', ERRORS.INVALID_EVENT_DATA);
        }
        assertDaysType(days);
        assertTimeOfDayType(startTime);
        assertTimeOfDayType(endTime);
        createRecurringEvent(title, UID, days, startTime, endTime, description, courseId);
    }
}

export function getEvents(UID: string): Task[] {
    requireUser(UID);

    return [...getOneTimeEventsByUID(UID), ...getRecurringEventsByUID(UID)];
}

export function deleteEvent(UID: string, eventId: string): void {
    requireUser(UID);

    const deletedCount = deleteEventById(UID, eventId);
    if (deletedCount === 0) {
        throw new AppError('Event not found', ERRORS.EVENT_NOT_FOUND);
    }
}

export function updateEventCompletion(UID: string, eventId: string, completed: boolean): void {
    requireUser(UID);

    const updatedCount = updateOneTimeEventCompletion(UID, eventId, completed ? 1 : 0);
    if (updatedCount === 0) {
        throw new AppError('Event not found', ERRORS.EVENT_NOT_FOUND);
    }
}

export function toggleRecurringEventInstance(UID: string, eventId: string, instanceDate: string, completed: boolean): void {
    requireUser(UID);
    if (!instanceDate || typeof instanceDate !== 'string') {
        throw new AppError('Instance date is required', ERRORS.INVALID_EVENT_DATA);
    }
    setRecurringEventInstanceCompletion(UID, eventId, instanceDate, completed);
}

export function updateEvent(
    UID: string,
    eventId: string,
    type: TaskType,
    title: string,
    description: string | undefined,
    start?: string,
    end?: string,
    days?: Array<DAY>,
    startTime?: TimeOfDay,
    endTime?: TimeOfDay,
    courseId?: string
): void {
    requireUser(UID);

    assertTaskType(type);
    if (!title || !title.trim()) {
        throw new AppError('Event title is required', ERRORS.INVALID_EVENT_DATA);
    }

    let updatedCount = 0;

    if (type === TASKS.ONE_TIME) {
        if (!start || !end) {
            throw new AppError('Start and end are required for one-time events', ERRORS.INVALID_EVENT_DATA);
        }
        const startObj = convertToDateObj(start);
        const endObj = convertToDateObj(end);
        if (endObj.getTime() < startObj.getTime()) {
            throw new AppError('Event end must be after its start', ERRORS.INVALID_EVENT_DATA);
        }
        updatedCount = updateOneTimeEventRow(UID, eventId, title, description, startObj.toISOString(), endObj.toISOString(), courseId);
    } else {
        if (!days || days.length === 0) {
            throw new AppError('At least one day is required for recurring events', ERRORS.INVALID_EVENT_DATA);
        }
        if (!startTime || !endTime) {
            throw new AppError('Start and end times are required for recurring events', ERRORS.INVALID_EVENT_DATA);
        }
        assertDaysType(days);
        assertTimeOfDayType(startTime);
        assertTimeOfDayType(endTime);
        updatedCount = updateRecurringEventRow(
            UID,
            eventId,
            title,
            description,
            JSON.stringify(days),
            startTime.hour,
            startTime.minute,
            endTime.hour,
            endTime.minute,
            courseId
        );
    }

    if (updatedCount === 0) {
        throw new AppError('Event not found', ERRORS.EVENT_NOT_FOUND);
    }
}

export function createCourse(name: string, UID: string, code?: string, color?: string): void {
    if (!name || !name.trim()) {
        throw new AppError('Course name is required', ERRORS.INVALID_COURSE_DATA);
    }
    requireUser(UID);
    createCourseRow({
        id: crypto.randomUUID(),
        uid: UID,
        course_name: name.trim(),
        course_code: code?.trim() || undefined,
        color_code: color || undefined,
        created_at: new Date().toISOString(),
    });
}

export function getCourses(UID: string): Course[] {
    requireUser(UID);
    return getCoursesByUID(UID).map(row => ({
        id: row.id,
        name: row.course_name,
        code: row.course_code || undefined,
        color: row.color_code || undefined,
    }));
}

export function deleteCourse(UID: string, courseId: string): void {
    requireUser(UID);
    const course = getCourseById(UID, courseId);
    if (!course) {
        throw new AppError('Course not found', ERRORS.COURSE_NOT_FOUND);
    }
    deleteCourseById(UID, courseId);
}

// SETTINGS

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
        },
        icalUrl: row.ical_url || undefined,
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

// ICAL IMPORT

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
    matchedCourseId?: string;
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
    courseId?: string;
}

export interface ImportResult {
    createdCourses: number;
    importedEvents: number;
    skipped: number;
}

const groupingKey = (ev: ParsedICalEvent): string => ev.detectedCode || UNCATEGORISED_KEY;
// Imported events are dated occurrences; a UID recurs across many starts.
const dedupKey = (ev: ParsedICalEvent): string => `O:${ev.sourceUid}:${ev.start}`;

/**
 * Fetch and parse an iCal feed, group its events by detected course code, and match
 * each group against the user's existing courses. Persists nothing — the frontend
 * shows this as a review screen and sends confirmed decisions back to commit.
 */
export async function previewICalImport(UID: string, url: string): Promise<ImportPreview> {
    requireUser(UID);
    if (!url || typeof url !== 'string' || !url.trim()) {
        throw new AppError('An iCal URL is required', ERRORS.INVALID_ICAL_URL);
    }

    const ics = await fetchICS(url);
    const events = parseICSToEvents(ics);

    const existingCourses = getCoursesByUID(UID);
    const importedKeys = getImportedSourceKeys(UID);

    const groups = new Map<string, ParsedICalEvent[]>();
    for (const ev of events) {
        const key = groupingKey(ev);
        const bucket = groups.get(key);
        if (bucket) bucket.push(ev);
        else groups.set(key, [ev]);
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
        const newEventCount = groupEvents.filter(ev => !importedKeys.has(dedupKey(ev))).length;

        proposedCourses.push({
            key,
            code,
            name: matched?.course_name || name,
            suggestedColor: matched?.color_code || IMPORT_PALETTE[colorIndex++ % IMPORT_PALETTE.length],
            matchedCourseId: matched?.id,
            eventCount: groupEvents.length,
            newEventCount,
        });
    }

    const alreadyImported = events.filter(ev => importedKeys.has(dedupKey(ev))).length;
    return { events, proposedCourses, alreadyImported };
}

/**
 * Persist a confirmed import: save the subscription URL, create/reuse the chosen
 * courses, and insert their events, skipping any already imported (by source UID).
 */
export function commitICalImport(
    UID: string,
    url: string,
    courseDecisions: CourseDecision[],
    events: ParsedICalEvent[]
): ImportResult {
    requireUser(UID);
    if (!url || typeof url !== 'string' || !url.trim()) {
        throw new AppError('An iCal URL is required', ERRORS.INVALID_ICAL_URL);
    }
    if (!Array.isArray(events) || !Array.isArray(courseDecisions)) {
        throw new AppError('Import events and course decisions are required', ERRORS.INVALID_ICAL_DATA);
    }

    const decisions = new Map<string, CourseDecision>();
    courseDecisions.forEach(d => decisions.set(d.key, d));

    const importedKeys = getImportedSourceKeys(UID);
    const db = getSQLiteDB();

    let createdCourses = 0;
    let importedEvents = 0;
    let skipped = 0;

    // Resolve a course id for a group, creating a new course on first use so that
    // re-imports (where every event is a duplicate) never leave empty courses behind.
    const courseIdByKey = new Map<string, string | undefined>();
    const resolveCourse = (decision: CourseDecision): string | undefined => {
        if (courseIdByKey.has(decision.key)) return courseIdByKey.get(decision.key);
        if (decision.courseId) {
            courseIdByKey.set(decision.key, decision.courseId);
            return decision.courseId;
        }
        const id = crypto.randomUUID();
        createCourseRow({
            id,
            uid: UID,
            course_name: (decision.name || decision.code || 'Imported').trim(),
            course_code: decision.code?.trim() || undefined,
            color_code: decision.color || undefined,
            created_at: new Date().toISOString(),
        });
        createdCourses++;
        courseIdByKey.set(decision.key, id);
        return id;
    };

    const run = db.transaction(() => {
        updateICalUrl(UID, url.trim());

        for (const ev of events) {
            const key = groupingKey(ev);
            const decision = decisions.get(key);
            if (!decision || !decision.include) {
                skipped++;
                continue;
            }
            const dk = dedupKey(ev);
            if (importedKeys.has(dk)) {
                skipped++;
                continue;
            }
            // Every imported event is a dated occurrence; skip malformed ones.
            if (!ev.start || !ev.end) {
                skipped++;
                continue;
            }

            const courseId = resolveCourse(decision);
            const title = ev.summary?.trim() || 'Untitled';
            createOneTimeEventRow({
                id: crypto.randomUUID(),
                uid: UID,
                course_id: courseId,
                title,
                description: ev.description,
                start_time: ev.start,
                end_time: ev.end,
                completed: 0,
                source_uid: ev.sourceUid,
                created_at: new Date().toISOString(),
            });
            importedKeys.add(dk);
            importedEvents++;
        }
    });
    run();

    return { createdCourses, importedEvents, skipped };
}
