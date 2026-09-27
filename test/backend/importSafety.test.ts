import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDB, closeDB, getSQLiteDB } from '../../backend/db/connection';
import { register } from '../../backend/auth';
import { commitICalImport, type ParsedICalEvent, type CourseDecision } from '../../backend/api/ical';
import { createCourseRow } from '../../backend/db/courses';
import { getItems, getItemOccurrences, setOneTimeCompletion, setOccurrenceCompletion, deleteItem } from '../../backend/api/items';
import { getCompletionsByUID } from '../../backend/db/items';

let uid: string;
const url = 'https://calendar.example/feed';
const event: ParsedICalEvent = {
  sourceUid: 'event-1', summary: 'Exam', start: '2026-07-06T09:00:00.000Z', end: '2026-07-06T10:00:00.000Z',
};
const decisions: CourseDecision[] = [{ key: 'UNCATEGORISED', include: true, name: 'Calendar' }];
const weekly = { ...event, rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4' };
const window = ['2026-07-01', '2026-08-01'] as const;
beforeEach(() => { initializeDB(':memory:'); uid = register('owner', 'Password123'); });
afterEach(closeDB);

function importEvents(events: ParsedICalEvent[], choices = decisions) {
  return commitICalImport(uid, url, choices, events);
}

describe('import synchronization integrity', () => {
  it('preserves one-time completion while updating feed details', () => {
    importEvents([event]);
    const original = getItems(uid)[0];
    setOneTimeCompletion(uid, original.id, true);
    importEvents([{ ...event, summary: 'Updated exam', location: 'Room B' }]);
    expect(getItems(uid)[0]).toMatchObject({ id: original.id, title: 'Updated exam', location: 'Room B', completed: true });
    expect(getItemOccurrences(uid, ...window)[0].completed).toBe(true);
  });

  it('preserves recurring completions through the real import service', () => {
    importEvents([weekly]);
    const original = getItems(uid)[0];
    setOccurrenceCompletion(uid, original.id, event.start, true);
    importEvents([{ ...weekly, summary: 'Updated lecture' }]);
    const occurrences = getItemOccurrences(uid, ...window);
    expect(occurrences).toHaveLength(4);
    expect(occurrences.filter(o => o.completed).map(o => o.start)).toEqual([event.start]);
    expect(occurrences.every(o => o.title === 'Updated lecture')).toBe(true);
  });

  it('clears incompatible completion when switching recurrence and never resurrects it', () => {
    importEvents([weekly]);
    const id = getItems(uid)[0].id;
    setOccurrenceCompletion(uid, id, event.start, true);
    importEvents([event]);
    expect(getCompletionsByUID(uid)).toEqual([]);
    expect(getItems(uid)[0]).toMatchObject({ recurrence: 'ONE_TIME', completed: false });
    setOneTimeCompletion(uid, id, true);
    importEvents([weekly]);
    expect(getItems(uid)[0]).toMatchObject({ recurrence: 'RECURRING', completedDates: [] });
    expect(getItemOccurrences(uid, ...window).some(o => o.completed)).toBe(false);
  });

  it('allows deletion and re-creates the event on a later import', () => {
    importEvents([event]);
    deleteItem(uid, getItems(uid)[0].id);
    expect(getItems(uid)).toEqual([]);
    importEvents([event]);
    expect(getItems(uid)).toHaveLength(1);
  });

  it('rejects foreign and missing course IDs without partial writes', () => {
    const other = register('other', 'Password123');
    const foreign = createCourseRow({ uid: other, course_name: 'Private', created_at: event.start });
    for (const courseId of [foreign, 9999]) {
      expect(() => importEvents([event], [{ ...decisions[0], courseId }])).toThrow('Course not found');
      expect(getSQLiteDB().prepare('SELECT * FROM icals WHERE uid = ?').all(uid)).toEqual([]);
      expect(getItems(uid)).toEqual([]);
    }
    // Check selections even when an existing item's course would otherwise be reused.
    importEvents([event]);
    const original = getItems(uid)[0];
    expect(() => importEvents([{ ...event, summary: 'Changed' }], [{ ...decisions[0], courseId: foreign }])).toThrow('Course not found');
    expect(getItems(uid)[0]).toEqual(original);
  });

  it('accepts an owned course', () => {
    const courseId = createCourseRow({ uid, course_name: 'Owned', created_at: event.start });
    expect(importEvents([event], [{ ...decisions[0], courseId }]).createdCourses).toBe(0);
    expect(getItems(uid)[0].courseId).toBe(courseId);
  });

  it('rolls back subscription, courses, and events after a write failure', () => {
    getSQLiteDB().exec(`CREATE TRIGGER fail_second BEFORE INSERT ON items
      WHEN NEW.ical_uid = 'fail' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;`);
    expect(() => importEvents([event, { ...event, sourceUid: 'fail' }])).toThrow('fixture failure');
    for (const table of ['items', 'courses', 'icals']) {
      expect(getSQLiteDB().prepare(`SELECT * FROM ${table} WHERE uid = ?`).all(uid)).toEqual([]);
    }
  });
});
