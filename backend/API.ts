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
} from './dbManager';

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

interface UniversitySettings {
    teachingPeriodWeeks: number;
    termWeeks: number;
    termSystem: string;
    termStartDates: TermDate[];
    flexWeek: number;
}

const TERM_SYSTEMS = ['SEMESTER', 'TRIMESTER'];

// Mirrors DEFAULT_SETTINGS on the frontend — returned when a user has no saved settings yet.
const DEFAULT_UNIVERSITY_SETTINGS: UniversitySettings = {
    teachingPeriodWeeks: 12,
    termWeeks: 13,
    termSystem: 'SEMESTER',
    termStartDates: [{ day: 0, month: 0 }, { day: 0, month: 0 }],
    flexWeek: 6,
};

export function getSettings(UID: string): { university: UniversitySettings } {
    requireUser(UID);

    const row = getSettingsByUID(UID);
    if (!row) {
        return { university: DEFAULT_UNIVERSITY_SETTINGS };
    }

    return {
        university: {
            teachingPeriodWeeks: row.teaching_period_weeks,
            termWeeks: row.term_weeks,
            termSystem: row.term_system,
            flexWeek: row.flex_week,
            termStartDates: row.term_start_dates.map(d => ({ day: d.day, month: d.month })),
        },
    };
}

export function saveSettings(UID: string, university: UniversitySettings): void {
    requireUser(UID);

    if (!university || typeof university !== 'object') {
        throw new AppError('University settings are required', ERRORS.INVALID_SETTINGS_DATA);
    }

    const { teachingPeriodWeeks, termWeeks, termSystem, termStartDates, flexWeek } = university;

    if (!TERM_SYSTEMS.includes(termSystem)) {
        throw new AppError('Invalid term system', ERRORS.INVALID_SETTINGS_DATA);
    }
    if (!Number.isInteger(teachingPeriodWeeks) || teachingPeriodWeeks < 1) {
        throw new AppError('Teaching period must be at least 1 week', ERRORS.INVALID_SETTINGS_DATA);
    }
    if (!Number.isInteger(termWeeks) || termWeeks < 1) {
        throw new AppError('Term duration must be at least 1 week', ERRORS.INVALID_SETTINGS_DATA);
    }
    if (!Number.isInteger(flexWeek) || flexWeek < 1 || flexWeek > termWeeks) {
        throw new AppError('Flex week must be within the term duration', ERRORS.INVALID_SETTINGS_DATA);
    }
    if (!Array.isArray(termStartDates)) {
        throw new AppError('Term start dates are required', ERRORS.INVALID_SETTINGS_DATA);
    }

    // Size the stored dates to the term system (2 for semester, 3 for trimester).
    const expectedTerms = termSystem === 'TRIMESTER' ? 3 : 2;
    const normalizedDates = Array.from({ length: expectedTerms }, (_, i) => {
        const d = termStartDates[i] ?? { day: 0, month: 0 };
        const day = Number(d.day) || 0;
        const month = Number(d.month) || 0;
        if (day < 0 || day > 31 || month < 0 || month > 12) {
            throw new AppError('Invalid term start date', ERRORS.INVALID_SETTINGS_DATA);
        }
        return { day, month };
    });

    upsertSettings({
        uid: UID,
        teaching_period_weeks: teachingPeriodWeeks,
        term_weeks: termWeeks,
        term_system: termSystem,
        flex_week: flexWeek,
        term_start_dates: normalizedDates,
    });
}
