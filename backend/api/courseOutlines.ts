import AppError from '../error/appError';
import { ERRORS } from '../error/errors';
import { getSQLiteDB } from '../db/connection';
import { getCourse } from './courses';
import { fetchCourseOutline, OutlineError, parseOutlineUrl } from './unswOutline';
import { syncOutlineItems } from './outlineItems';
import type { OutlineResult, SavedOutlineResult, OutlineSyncSummary } from '../../shared/outline';

export function getCourseOutline(uid: string, courseId: number): OutlineResult | null {
    getCourse(uid, courseId);
    const row = getSQLiteDB().prepare<[number], { result_json: string }>(
        'SELECT result_json FROM course_outlines WHERE course_id = ?'
    ).get(courseId);
    return row ? JSON.parse(row.result_json) as OutlineResult : null;
}

export async function saveCourseOutline(uid: string, courseId: number, url: unknown, allowCodeMismatch: unknown = false): Promise<SavedOutlineResult> {
    const course = getCourse(uid, courseId);
    if (typeof url !== 'string' || !url.trim() || url.length > 4096) {
        throw new AppError('Paste a complete UNSW course outline link.', ERRORS.INVALID_COURSE_OUTLINE);
    }
    if (typeof allowCodeMismatch !== 'boolean') {
        throw new AppError('allowCodeMismatch must be a boolean.', ERRORS.INVALID_COURSE_OUTLINE);
    }
    const mismatch = (code: string, outlineCode: string) => new AppError(
        `This outline is for ${outlineCode}, but this group has course code ${code}. Some courses share an outline under different codes.`,
        ERRORS.COURSE_OUTLINE_CODE_MISMATCH,
    );
    let result: OutlineResult;
    try {
        const offering = parseOutlineUrl(url.trim());
        if (!allowCodeMismatch && course.course_code && course.course_code.trim().toUpperCase() !== offering.courseCode) {
            throw mismatch(course.course_code, offering.courseCode);
        }
        result = await fetchCourseOutline(url.trim());
    } catch (error) {
        if (error instanceof OutlineError) {
            const invalid = ['INVALID_URL', 'INVALID_OFFERING', 'OFFERING_MISMATCH'].includes(error.code);
            throw new AppError(error.message, invalid ? ERRORS.INVALID_COURSE_OUTLINE : ERRORS.COURSE_OUTLINE_FETCH_FAILED);
        }
        throw error;
    }
    // The course may have been deleted or edited while the network request ran.
    const current = getCourse(uid, courseId);
    if (current.course_code && current.course_code.trim().toUpperCase() !== result.course.courseCode) {
        if (!allowCodeMismatch || current.course_code.trim().toUpperCase() !== course.course_code?.trim().toUpperCase()) {
            throw mismatch(current.course_code, result.course.courseCode);
        }
        result = { ...result, warnings: [...result.warnings, {
            code: 'COURSE_CODE_MISMATCH', path: 'course.courseCode',
            message: `This group uses ${current.course_code}; its outline uses ${result.course.courseCode}. You chose to continue with this outline.`,
        }] };
    }
    return getSQLiteDB().transaction(() => {
        const sync = syncOutlineItems(uid, courseId, result);
        getSQLiteDB().prepare(`
            INSERT INTO course_outlines (course_id, result_json, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(course_id) DO UPDATE SET result_json = excluded.result_json, updated_at = excluded.updated_at
        `).run(courseId, JSON.stringify(result), new Date().toISOString());
        return { outline: result, sync };
    })();
}

/** Backfills previously saved outlines on dashboard open, without a network request. */
export function syncSavedCourseOutline(uid: string, courseId: number): { outline: OutlineResult | null; sync: OutlineSyncSummary } {
    return getSQLiteDB().transaction(() => {
        const outline = getCourseOutline(uid, courseId);
        const sync = outline ? syncOutlineItems(uid, courseId, outline)
            : { created: 0, updated: 0, unchanged: 0, linked: 0, skipped: 0 };
        return { outline, sync };
    })();
}
