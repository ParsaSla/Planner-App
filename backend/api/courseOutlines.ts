import AppError from '../error/appError';
import { ERRORS } from '../error/errors';
import { getSQLiteDB } from '../db/connection';
import { getCourse } from './courses';
import { fetchCourseOutline, OutlineError, parseOutlineUrl } from './unswOutline';
import { outlineDeadlineSourceKey, syncOutlineItems } from './outlineItems';
import { extractOutlineCandidates } from './outlineAi';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import type { OutlineImportCandidate, OutlineImportCommit, OutlineImportDraft, OutlineImportPreview, OutlineResult, OutlineSyncSummary } from '../../shared/outline';

const WEEKDAY_NUMBER: Record<NonNullable<OutlineImportCandidate['weeklySeries']>['weekday'], number> = {
    MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7,
};
const MAX_EXPANDED_DEADLINES = 200;

export function getCourseOutline(uid: string, courseId: number): OutlineResult | null {
    getCourse(uid, courseId);
    const row = getSQLiteDB().prepare<[number], { result_json: string }>(
        'SELECT result_json FROM course_outlines WHERE course_id = ?'
    ).get(courseId);
    return row ? JSON.parse(row.result_json) as OutlineResult : null;
}

export async function saveCourseOutline(uid: string, courseId: number, url: unknown, allowCodeMismatch: unknown = false): Promise<OutlineImportPreview> {
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
    const ai = await extractOutlineCandidates(result);
    const latest = getCourse(uid, courseId);
    if (latest.course_code && latest.course_code.trim().toUpperCase() !== result.course.courseCode &&
        (!allowCodeMismatch || latest.course_code.trim().toUpperCase() !== course.course_code?.trim().toUpperCase())) {
        throw mismatch(latest.course_code, result.course.courseCode);
    }
    if (latest.course_code && latest.course_code.trim().toUpperCase() !== result.course.courseCode &&
        !result.warnings.some(warning => warning.code === 'COURSE_CODE_MISMATCH')) {
        result = { ...result, warnings: [...result.warnings, {
            code: 'COURSE_CODE_MISMATCH', path: 'course.courseCode',
            message: `This group uses ${latest.course_code}; its outline uses ${result.course.courseCode}. You chose to continue with this outline.`,
        }] };
    }
    const candidates: OutlineImportCandidate[] = result.assessments.flatMap(assessment => assessment.deadlines.map((deadline, index) => ({
        id: `unsw-${assessment.key}-${index + 1}`, assessmentKey: assessment.key, deadline, source: 'unsw',
        selected: deadline.kind === 'datetime' && Boolean(deadline.utc && deadline.timezone),
        editLocalDate: 'localDate' in deadline ? deadline.localDate : '',
        editLocalTime: deadline.kind === 'datetime' ? deadline.localTime : '',
        editTimezone: deadline.kind === 'datetime' ? deadline.timezone ?? result.course.timezone ?? '' : result.course.timezone ?? '',
        sourceKey: outlineDeadlineSourceKey(result.course, assessment.title, deadline.label),
    })));
    const existing = new Set(candidates.map(candidate => {
        const deadline = candidate.deadline;
        return deadline.kind === 'datetime' ? `${candidate.assessmentKey}|${deadline.localDate}|${deadline.localTime}` : '';
    }));
    candidates.push(...ai.candidates.filter(candidate => {
        const deadline = candidate.deadline;
        const key = candidate.weeklySeries
            ? `${candidate.assessmentKey}|weekly|${candidate.weeklySeries.weekday}|${candidate.weeklySeries.dueOffsetDays}|${candidate.weeklySeries.dueTime}`
            : deadline.kind === 'datetime' ? `${candidate.assessmentKey}|${deadline.localDate}|${deadline.localTime}` : '';
        if (!key || existing.has(key)) return false;
        existing.add(key);
        return true;
    }).map(candidate => ({ ...candidate, selected: false,
        sourceKey: outlineDeadlineSourceKey(result.course, result.assessments.find(assessment => assessment.key === candidate.assessmentKey)!.title, candidate.deadline.label),
    })));
    const createdAt = new Date().toISOString();
    const draft: OutlineImportDraft = { id: randomUUID(), courseId, sourceUrl: result.provenance.sourceUrl, createdAt,
        committedAt: null, aiStatus: ai.status, aiMessage: ai.message, aiModel: ai.model, aiRawOutput: ai.rawOutput,
        aiReportedCandidates: ai.reportedCandidates, aiAcceptedCandidates: candidates.filter(candidate => candidate.source === 'ai').length,
        candidates };
    return getSQLiteDB().transaction(() => {
        getSQLiteDB().prepare(`
            INSERT INTO course_outlines (course_id, result_json, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(course_id) DO UPDATE SET result_json = excluded.result_json, updated_at = excluded.updated_at
        `).run(courseId, JSON.stringify(result), new Date().toISOString());
        getSQLiteDB().prepare(`
            INSERT INTO course_outline_import_drafts (course_id, draft_id, draft_json, committed_at) VALUES (?, ?, ?, NULL)
            ON CONFLICT(course_id) DO UPDATE SET draft_id = excluded.draft_id, draft_json = excluded.draft_json, committed_at = NULL
        `).run(courseId, draft.id, JSON.stringify(draft));
        return { outline: result, draft };
    })();
}

export function getCourseOutlineDraft(uid: string, courseId: number): OutlineImportDraft | null {
    getCourse(uid, courseId);
    const row = getSQLiteDB().prepare<[number], { draft_json: string; committed_at: string | null }>(
        'SELECT draft_json, committed_at FROM course_outline_import_drafts WHERE course_id = ?'
    ).get(courseId);
    if (!row) return null;
    const draft = JSON.parse(row.draft_json) as OutlineImportDraft;
    return { ...draft, committedAt: row.committed_at };
}

export function commitCourseOutlineDraft(uid: string, courseId: number, input: unknown): { sync: OutlineSyncSummary; draft: OutlineImportDraft } {
    getCourse(uid, courseId);
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new AppError('A valid outline draft confirmation is required.', ERRORS.INVALID_COURSE_OUTLINE);
    }
    const commit = input as OutlineImportCommit;
    if (typeof commit.draftId !== 'string' || !Array.isArray(commit.candidates) || commit.candidates.length > 200 ||
        commit.candidates.some(candidate => !candidate || typeof candidate.id !== 'string' || typeof candidate.selected !== 'boolean' ||
            typeof candidate.label !== 'string' || candidate.label.trim().length > 200 ||
            typeof candidate.localDate !== 'string' || typeof candidate.localTime !== 'string' && candidate.localTime !== null ||
            typeof candidate.timezone !== 'string' && candidate.timezone !== null ||
            typeof candidate.firstReleaseDate !== 'string' && candidate.firstReleaseDate !== null && candidate.firstReleaseDate !== undefined ||
            typeof candidate.lastReleaseDate !== 'string' && candidate.lastReleaseDate !== null && candidate.lastReleaseDate !== undefined)) {
        throw new AppError('The outline review contains invalid candidate edits.', ERRORS.INVALID_COURSE_OUTLINE);
    }
    return getSQLiteDB().transaction(() => {
        const db = getSQLiteDB();
        const stored = db.prepare<[number], { draft_id: string; draft_json: string; committed_at: string | null }>(
            'SELECT draft_id, draft_json, committed_at FROM course_outline_import_drafts WHERE course_id = ?'
        ).get(courseId);
        if (!stored || stored.draft_id !== commit.draftId || stored.committed_at) {
            throw new AppError('This outline review is no longer current. Refresh the outline and review it again.', ERRORS.COURSE_OUTLINE_DRAFT_STALE);
        }
        const draft = JSON.parse(stored.draft_json) as OutlineImportDraft;
        const result = getCourseOutline(uid, courseId);
        if (!result) throw new AppError('The saved outline for this review no longer exists.', ERRORS.COURSE_OUTLINE_DRAFT_STALE);
        const updates = new Map(commit.candidates.map(candidate => [candidate.id, candidate]));
        if (updates.size !== commit.candidates.length || updates.size !== draft.candidates.length || draft.candidates.some(candidate => !updates.has(candidate.id))) {
            throw new AppError('The outline review is incomplete or contains duplicate candidates.', ERRORS.INVALID_COURSE_OUTLINE);
        }
        const selected: Array<{ candidate: OutlineImportCandidate; deadline: NonNullable<OutlineImportCandidate['deadline']>; sourceKey: string }> = [];
        for (const candidate of draft.candidates) {
            const edit = updates.get(candidate.id)!;
            if (!edit.selected) continue;
            if (candidate.weeklySeries) {
                const series = candidate.weeklySeries;
                const first = edit.firstReleaseDate ? DateTime.fromISO(edit.firstReleaseDate, { zone: 'UTC' }) : null;
                const last = edit.lastReleaseDate ? DateTime.fromISO(edit.lastReleaseDate, { zone: 'UTC' }) : null;
                const timezone = edit.timezone || series.timezone;
                if (!first?.isValid || !last?.isValid || first.toISODate() !== edit.firstReleaseDate || last.toISODate() !== edit.lastReleaseDate ||
                    !timezone || first.weekday !== WEEKDAY_NUMBER[series.weekday] || last.weekday !== WEEKDAY_NUMBER[series.weekday] || last < first ||
                    last.diff(first, 'days').days % 7 !== 0) {
                    throw new AppError(`Choose first and last ${series.weekday.toLowerCase()} release dates for this weekly series.`, ERRORS.INVALID_COURSE_OUTLINE);
                }
                const count = last.diff(first, 'days').days / 7 + 1;
                if (count > MAX_EXPANDED_DEADLINES || selected.length + count > MAX_EXPANDED_DEADLINES) {
                    throw new AppError(`A review can add at most ${MAX_EXPANDED_DEADLINES} deadlines.`, ERRORS.INVALID_COURSE_OUTLINE);
                }
                const assessment = result.assessments.find(item => item.key === candidate.assessmentKey);
                if (!assessment) throw new AppError('A selected deadline no longer matches this outline.', ERRORS.INVALID_COURSE_OUTLINE);
                for (let release = first; release <= last; release = release.plus({ days: 7 })) {
                    const dueDate = release.plus({ days: series.dueOffsetDays }).toISODate()!;
                    const local = DateTime.fromISO(`${dueDate}T${series.dueTime}`, { zone: timezone });
                    if (!local.isValid || local.toFormat('HH:mm') !== series.dueTime || local.getPossibleOffsets().length !== 1) {
                        throw new AppError('A generated weekly deadline has an invalid or ambiguous time.', ERRORS.INVALID_COURSE_OUTLINE);
                    }
                    const deadline = { kind: 'datetime' as const, label: edit.label.trim(), raw: candidate.deadline.raw,
                        evidence: candidate.deadline.evidence, assumptions: [`Released every ${series.weekday.toLowerCase()} at ${series.releaseTime}; due ${series.dueOffsetDays} days later.`],
                        localDate: dueDate, localTime: series.dueTime, timezone, utc: local.toUTC().toISO() };
                    selected.push({ candidate, deadline,
                        sourceKey: JSON.stringify([candidate.sourceKey ?? candidate.id, dueDate]) });
                }
                continue;
            }
            if (!edit.label.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(edit.localDate)) {
                throw new AppError('Selected deadlines need a valid date and label.', ERRORS.INVALID_COURSE_OUTLINE);
            }
            const date = DateTime.fromISO(edit.localDate, { zone: 'UTC' });
            if (!date.isValid || date.toISODate() !== edit.localDate) throw new AppError('A selected deadline has an invalid date.', ERRORS.INVALID_COURSE_OUTLINE);
            const assessment = result.assessments.find(item => item.key === candidate.assessmentKey);
            if (!assessment) throw new AppError('A selected deadline no longer matches this outline.', ERRORS.INVALID_COURSE_OUTLINE);
            let deadline = { ...candidate.deadline, label: edit.label.trim(), localDate: edit.localDate } as OutlineImportCandidate['deadline'];
            if (edit.localTime !== null) {
                if (!/^\d{2}:\d{2}$/.test(edit.localTime)) throw new AppError('A selected deadline has an invalid time.', ERRORS.INVALID_COURSE_OUTLINE);
                const timezone = edit.timezone || (candidate.deadline.kind === 'datetime' ? candidate.deadline.timezone : result.course.timezone);
                if (!timezone) throw new AppError('A timezone is required before adding this timed deadline.', ERRORS.INVALID_COURSE_OUTLINE);
                const local = DateTime.fromISO(`${edit.localDate}T${edit.localTime}`, { zone: timezone });
                if (!local.isValid || local.toFormat('HH:mm') !== edit.localTime || local.getPossibleOffsets().length !== 1) {
                    throw new AppError('A selected deadline time is invalid or ambiguous.', ERRORS.INVALID_COURSE_OUTLINE);
                }
                deadline = { kind: 'datetime', label: edit.label.trim(), raw: deadline.raw, evidence: deadline.evidence,
                    assumptions: deadline.assumptions, localDate: edit.localDate, localTime: edit.localTime,
                    timezone, utc: local.toUTC().toISO() };
            }
            if (deadline.kind !== 'datetime' || !deadline.utc || !deadline.timezone) {
                throw new AppError('Only confirmed timed deadlines can be added to the calendar.', ERRORS.INVALID_COURSE_OUTLINE);
            }
            selected.push({ candidate, deadline, sourceKey: candidate.sourceKey ?? '' });
        }
        const selectedByAssessment = new Map<string, typeof selected>();
        for (const item of selected) selectedByAssessment.set(item.candidate.assessmentKey,
            [...(selectedByAssessment.get(item.candidate.assessmentKey) ?? []), item]);
        const toSync: OutlineResult = { ...result, assessments: result.assessments.map(assessment => ({ ...assessment,
            deadlines: (selectedByAssessment.get(assessment.key) ?? []).map(item => item.deadline),
        })) };
        const sourceKeyOverrides = new Map<string, string>();
        for (const [assessmentKey, items] of selectedByAssessment) {
            items.forEach((item, index) => { if (item.sourceKey) sourceKeyOverrides.set(`${assessmentKey}:${index}`, item.sourceKey); });
        }
        const sync = syncOutlineItems(uid, courseId, toSync, sourceKeyOverrides);
        const committedAt = new Date().toISOString();
        const committedDraft = { ...draft, committedAt };
        db.prepare('UPDATE course_outline_import_drafts SET draft_json = ?, committed_at = ? WHERE course_id = ? AND draft_id = ? AND committed_at IS NULL')
            .run(JSON.stringify(committedDraft), committedAt, courseId, draft.id);
        return { sync, draft: committedDraft };
    })();
}

/** Kept for API compatibility; opening a dashboard must not mutate calendar items. */
export function syncSavedCourseOutline(uid: string, courseId: number): { outline: OutlineResult | null; draft: OutlineImportDraft | null; sync: OutlineSyncSummary } {
    const outline = getCourseOutline(uid, courseId);
    return { outline, draft: getCourseOutlineDraft(uid, courseId), sync: { created: 0, updated: 0, unchanged: 0, linked: 0, skipped: 0 } };
}
