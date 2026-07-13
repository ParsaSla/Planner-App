import AppError from '../error/appError';
import { ERRORS } from '../error/errors';
import {
    createCourseRow,
    getCoursesByUID,
    getCourseById,
    deleteCourseById,
} from '../db/courses';
import { requireUser } from './helpers';

export interface Course {
    id: number;
    name: string;
    code?: string;
    color?: string;
}

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

export function getCourses(UID: string): Course[] {
    requireUser(UID);
    return getCoursesByUID(UID).map(row => ({
        id: row.id,
        name: row.course_name,
        code: row.course_code || undefined,
        color: row.color_code || undefined,
    }));
}

export function deleteCourse(UID: string, courseId: number): void {
    requireUser(UID);
    const course = getCourseById(UID, courseId);
    if (!course) {
        throw new AppError('Course not found', ERRORS.COURSE_NOT_FOUND);
    }
    deleteCourseById(UID, courseId);
}
