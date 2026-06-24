import { getSQLiteDB } from './connection';
import { CourseRow } from '../types/DBTypes';

export function createCourseRow(course: { id: string; uid: string; course_name: string; course_code?: string; color_code?: string; created_at: string }): void {
    const db = getSQLiteDB();
    db.prepare(
        `INSERT INTO courses (id, uid, course_name, course_code, color_code, created_at)
         VALUES (@id, @uid, @course_name, @course_code, @color_code, @created_at)`
    ).run({ ...course, course_code: course.course_code ?? null, color_code: course.color_code ?? null });
}

export function getCoursesByUID(uid: string): CourseRow[] {
    const db = getSQLiteDB();
    return db.prepare<{ uid: string }, CourseRow>('SELECT * FROM courses WHERE uid = @uid ORDER BY course_name ASC').all({ uid });
}

export function getCourseById(uid: string, courseId: string): CourseRow | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ uid: string; id: string }, CourseRow>('SELECT * FROM courses WHERE uid = @uid AND id = @id').get({ uid, id: courseId });
    return row || null;
}

export function deleteCourseById(uid: string, courseId: string): number {
    const db = getSQLiteDB();
    return db.prepare('DELETE FROM courses WHERE uid = @uid AND id = @id').run({ uid, id: courseId }).changes;
}
