import { getSQLiteDB } from './connection';

export interface CourseRow {
    id: number;
    uid: string;
    course_name: string;
    course_code?: string;
    color_code?: string;
    created_at: string;
}

const UPDATABLE_COLUMNS = ['course_name', 'course_code', 'color_code'] as const;

type UpdatableColumn = typeof UPDATABLE_COLUMNS[number];
export type CourseUpdate = Partial<Record<UpdatableColumn, CourseRow[UpdatableColumn]>>;


/** Inserts a course and returns its auto-assigned id. */
export function createCourseRow(course: { uid: string; course_name: string; course_code?: string; color_code?: string; created_at: string }): number {
    const db = getSQLiteDB();
    const info = db.prepare(
        `INSERT INTO courses (uid, course_name, course_code, color_code, created_at)
         VALUES (@uid, @course_name, @course_code, @color_code, @created_at)`
    ).run({ ...course, course_code: course.course_code ?? null, color_code: course.color_code ?? null });
    return Number(info.lastInsertRowid);
}

export function updateCourseById(uid: string, courseId: number, updates: CourseUpdate): number {
    const db = getSQLiteDB();
    const setClauses = Object.keys(updates).map(key => `${key} = @${key}`).join(', ');
    const params = { uid, id: courseId, ...updates };
    const sql = `UPDATE courses SET ${setClauses} WHERE uid = @uid AND id = @id`;
    return db.prepare(sql).run(params).changes;
}

export function getCoursesByUID(uid: string): CourseRow[] {
    const db = getSQLiteDB();
    return db.prepare<{ uid: string }, CourseRow>('SELECT * FROM courses WHERE uid = @uid ORDER BY course_name ASC').all({ uid });
}

export function getCourseById(uid: string, courseId: number): CourseRow | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ uid: string; id: number }, CourseRow>('SELECT * FROM courses WHERE uid = @uid AND id = @id').get({ uid, id: courseId });
    return row || null;
}

export function deleteCourseById(uid: string, courseId: number): number {
    const db = getSQLiteDB();
    return db.prepare('DELETE FROM courses WHERE uid = @uid AND id = @id').run({ uid, id: courseId }).changes;
}
