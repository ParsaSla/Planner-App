import { DateTime } from 'luxon';
import { getSQLiteDB } from '../db/connection';
import { createItemRow, getItemById, getItemsByUID, updateItemById } from '../db/items';
import type { OutlineAssessment, OutlineDeadline, OutlineResult, OutlineSyncSummary } from '../../shared/outline';

function normalized(value: string): string {
    return value.normalize('NFKC').toLowerCase().replace(/\bassignmnent\b/g, 'assignment')
        .replace(/\bmid[\s-]*term\b/g, 'midterm').replace(/\bexamination\b/g, 'exam')
        .replace(/[^a-z0-9]+/g, ' ').trim();
}
function titleIdentity(value: string): string {
    return normalized(value).replace(/\b[a-z]{4}\s?\d{4}\b/g, '').replace(/\b(?:due|deadline|submission)\b/g, '').replace(/\s+/g, ' ').trim();
}
function description(result: OutlineResult, assessment: OutlineAssessment, deadline: OutlineDeadline): string {
    return [
        assessment.description,
        assessment.weightPercent === null ? '' : `Assessment weight: ${assessment.weightPercent}% of the course${assessment.deadlines.length > 1 ? ' (shared across all submissions in this assessment)' : ''}.`,
        assessment.submissionNotes && `Submission notes: ${assessment.submissionNotes}`,
        assessment.hurdleRules && `Requirements: ${assessment.hurdleRules}`,
        assessment.additionalInformation,
        ...assessment.links.map(link => `${link.label}: ${link.url}`),
        `Deadline source: ${deadline.raw}`,
        ...deadline.assumptions,
        `Course outline: ${result.provenance.sourceUrl}`,
    ].filter(Boolean).join('\n\n');
}

/** Called inside a transaction by the outline service. Never fetches or changes completion. */
export function syncOutlineItems(uid: string, courseId: number, result: OutlineResult): OutlineSyncSummary {
    const db = getSQLiteDB();
    const summary: OutlineSyncSummary = { created: 0, updated: 0, unchanged: 0, linked: 0, skipped: 0 };
    const course = result.course;
    // A group's aliases share identity. Dates and response array positions deliberately do not.
    const offering = [course.year, course.term, course.teachingPeriod, course.deliveryLocation,
        course.deliveryMode, course.deliveryFormat, course.activityGroupId];
    const candidates = result.assessments.flatMap(assessment => assessment.deadlines.map(deadline => ({
        assessment, deadline,
        key: JSON.stringify([...offering, normalized(assessment.title), normalized(deadline.label)]),
    })));
    const counts = new Map<string, number>();
    for (const candidate of candidates) counts.set(candidate.key, (counts.get(candidate.key) ?? 0) + 1);
    const items = getItemsByUID(uid).filter(item => item.course_id === courseId && item.recurrence === 'ONE_TIME');
    const getMapping = db.prepare<[number, string], { item_id: number | null; managed: number }>(
        'SELECT item_id, managed FROM course_outline_items WHERE course_id = ? AND source_key = ?');
    const addMapping = db.prepare('INSERT INTO course_outline_items (course_id, source_key, item_id, managed) VALUES (?, ?, ?, ?)');
    const mapped = new Set(db.prepare<[number], { item_id: number }>(
        'SELECT item_id FROM course_outline_items WHERE course_id = ? AND item_id IS NOT NULL').all(courseId).map(row => row.item_id));
    const now = new Date().toISOString();

    for (const { assessment, deadline, key } of candidates) {
        if (counts.get(key)! > 1 || deadline.kind !== 'datetime' || !deadline.utc || !deadline.timezone) {
            summary.skipped++; continue;
        }
        const instant = DateTime.fromISO(deadline.utc, { setZone: true });
        const local = instant.setZone(deadline.timezone);
        if (!instant.isValid || local.toISODate() !== deadline.localDate || local.toFormat('HH:mm') !== deadline.localTime) {
            summary.skipped++; continue;
        }
        const start = instant.toUTC().toISO()!;
        const title = deadline.label || assessment.title;
        const fields = {
            title, description: description(result, assessment, deadline),
            start_date: start, end_date: start, timezone: deadline.timezone,
        };
        const mapping = getMapping.get(courseId, key);
        if (mapping) {
            // NULL is a tombstone: deliberately deleted deadlines stay deleted.
            const item = mapping.item_id == null ? null : getItemById(uid, mapping.item_id);
            if (!item || item.course_id !== courseId) { summary.skipped++; continue; }
            if (!mapping.managed) { summary.linked++; continue; }
            if (Object.entries(fields).every(([field, value]) => item[field as keyof typeof item] === value)) {
                summary.unchanged++;
            } else {
                updateItemById(uid, item.id, fields, now);
                summary.updated++;
            }
            continue;
        }
        // Reuse a clearly matching manual/iCal event; do not take over its scheduling or edits.
        const matches = items.filter(item => !mapped.has(item.id) && !item.all_day && item.start_date &&
            Date.parse(item.start_date) === instant.toMillis() && titleIdentity(item.title) === titleIdentity(title));
        if (matches.length > 1) { summary.skipped++; continue; }
        if (matches.length === 1) {
            addMapping.run(courseId, key, matches[0].id, 0); mapped.add(matches[0].id);
            summary.linked++; continue;
        }
        const itemId = createItemRow({ uid, course_id: courseId, kind: 'TASK', recurrence: 'ONE_TIME',
            ...fields, completed: 0, created_at: now });
        addMapping.run(courseId, key, itemId, 1); mapped.add(itemId);
        summary.created++;
    }
    return summary;
}
