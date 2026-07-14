import AppError from '../error/appError';
import { ERRORS } from '../error/errors';
import {
    CourseRow,
    CourseUpdate,
    createCourseRow,
    getCoursesByUID,
    getCourseById,
    updateCourseById,
    deleteCourseById,
} from '../db/courses';
import { requireUser } from './helpers';

export function createCourse(name: string, UID: string, code?: string, color?: string): void {
    if (!name || !name.trim()) {
        throw new AppError('Course name is required', ERRORS.INVALID_COURSE_DATA);
    }
    requireUser(UID);
    createCourseRow({
        uid: UID,
        course_name: name.trim(),
        course_code: code?.trim() || undefined,
        color_code: color || undefined,
        created_at: new Date().toISOString(),
    });
}

export function getCourses(UID: string): CourseRow[] {
    requireUser(UID);
    return getCoursesByUID(UID);
}

export function getCourse(UID: string, courseId: number): CourseRow {
    requireUser(UID);
    const row = getCourseById(UID, courseId);
    if (!row) {
        throw new AppError('Course not found', ERRORS.COURSE_NOT_FOUND);
    }
    return row;
}

/** Update a course's editable fields. Accepts the clean API shape ({ name, code, color }). */
export function updateCourse(
    UID: string,
    courseId: number,
    updates: { name?: string; code?: string; color?: string }
): void {
    requireUser(UID);
    if (!getCourseById(UID, courseId)) {
        throw new AppError('Course not found', ERRORS.COURSE_NOT_FOUND);
    }
    if (updates.name !== undefined && !updates.name.trim()) {
        throw new AppError('Course name is required', ERRORS.INVALID_COURSE_DATA);
    }
    const rowUpdates: CourseUpdate = {};
    if (updates.name !== undefined) rowUpdates.course_name = updates.name.trim();
    if (updates.code !== undefined) rowUpdates.course_code = updates.code.trim();
    if (updates.color !== undefined) rowUpdates.color_code = updates.color;
    if (Object.keys(rowUpdates).length === 0) return;
    updateCourseById(UID, courseId, rowUpdates);
}

export function deleteCourse(UID: string, courseId: number): void {
    requireUser(UID);
    const course = getCourseById(UID, courseId);
    if (!course) {
        throw new AppError('Course not found', ERRORS.COURSE_NOT_FOUND);
    }
    deleteCourseById(UID, courseId);
}
