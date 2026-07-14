import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDB, closeDB } from '../../backend/db/connection';
import { register } from '../../backend/auth';
import { createItem, getItems, updateItem, deleteItem, getItemOccurrences } from '../../backend/api/items';
import { createItemRow } from '../../backend/db/items';

// createItem/updateItem take courseID as a number but tolerate `undefined` (no course).
const NO_COURSE = undefined as unknown as number;
const NO_TIME = { hour: 0, minute: 0 };

describe('backend/api/items CRUD', () => {
  beforeEach(() => {
    closeDB();
    initializeDB(':memory:');
  });
  afterEach(() => {
    closeDB();
  });

  it('creates, retrieves, and deletes one-time and recurring items', () => {
    const uid = register('itemuser', 'Password123');

    createItem(uid, NO_COURSE, 'ONE_TIME', 'Submit report', 'Finish it', '', '',
      '2026-07-01T09:00:00.000Z', '2026-07-01T11:00:00.000Z', '', [], NO_TIME, NO_TIME);

    createItem(uid, NO_COURSE, 'RECURRING', 'Weekly review', 'desc', 'Room 1', '',
      '2026-07-06T00:00:00.000Z', '', '', ['MONDAY', 'WEDNESDAY'],
      { hour: 9, minute: 0 }, { hour: 10, minute: 30 });

    const items = getItems(uid);
    expect(items.length).toBe(2);

    const oneTime = items.find(i => i.recurrence === 'ONE_TIME')!;
    const recurring = items.find(i => i.recurrence === 'RECURRING')!;
    expect(oneTime).toBeTruthy();
    expect(recurring).toBeTruthy();

    // Recurring items expose daysOfWeek derived from the stored RRULE, plus their times.
    if (recurring.recurrence === 'RECURRING') {
      expect(recurring.daysOfWeek).toEqual(['MONDAY', 'WEDNESDAY']);
      expect(recurring.start_time).toEqual({ hour: 9, minute: 0 });
      expect(recurring.end_time).toEqual({ hour: 10, minute: 30 });
    }

    deleteItem(uid, oneTime.id);
    const remaining = getItems(uid);
    expect(remaining.length).toBe(1);
    expect(remaining[0].recurrence).toBe('RECURRING');
  });

  it('rejects a one-time item whose end is before its start is not required, but bad dates throw', () => {
    const uid = register('itemuser2', 'Password123');
    expect(() =>
      createItem(uid, NO_COURSE, 'ONE_TIME', 'Bad', '', '', '', 'not-a-date', 'also-bad', '', [], NO_TIME, NO_TIME)
    ).toThrow();
  });

  it('updates an item in place', () => {
    const uid = register('itemuser3', 'Password123');
    createItem(uid, NO_COURSE, 'ONE_TIME', 'Workshop', '', '', '',
      '2026-07-01T09:00:00.000Z', '2026-07-01T11:00:00.000Z', '', [], NO_TIME, NO_TIME);

    const item = getItems(uid)[0];
    updateItem(item.id, uid, NO_COURSE, 'ONE_TIME', 'Workshop (updated)', 'New desc', '', '',
      '2026-07-02T13:00:00.000Z', '2026-07-02T15:00:00.000Z', '', [], NO_TIME, NO_TIME);

    const updated = getItems(uid)[0];
    expect(updated.title).toBe('Workshop (updated)');
    if (updated.recurrence === 'ONE_TIME') {
      expect(new Date(updated.start_date).toISOString()).toBe('2026-07-02T13:00:00.000Z');
    }
  });
});

describe('backend/api/items getItemOccurrences', () => {
  beforeEach(() => {
    closeDB();
    initializeDB(':memory:');
  });
  afterEach(() => {
    closeDB();
  });

  it('includes a one-time item only when the window contains its start', () => {
    const uid = register('occuser1', 'Password123');
    createItem(uid, NO_COURSE, 'ONE_TIME', 'Exam', '', '', '',
      '2026-07-01T09:00:00.000Z', '2026-07-01T11:00:00.000Z', '', [], NO_TIME, NO_TIME);

    const inside = getItemOccurrences(uid, '2026-06-30T00:00:00.000Z', '2026-07-02T00:00:00.000Z');
    expect(inside).toHaveLength(1);
    expect(inside[0].start).toBe('2026-07-01T09:00:00.000Z');
    expect(inside[0].recurrence).toBe('ONE_TIME');

    const outside = getItemOccurrences(uid, '2026-07-02T00:00:00.000Z', '2026-07-05T00:00:00.000Z');
    expect(outside).toHaveLength(0);
  });

  it('expands a weekly recurring item, honouring the UNTIL bound', () => {
    const uid = register('occuser2', 'Password123');
    // Weekly on Mondays, anchored 2026-07-06 (a Monday) at 09:00, ending 2026-07-20.
    createItem(uid, NO_COURSE, 'RECURRING', 'Lecture', '', '', '',
      '2026-07-06T00:00:00.000Z', '2026-07-20T00:00:00.000Z', '', ['MONDAY'],
      { hour: 9, minute: 0 }, { hour: 10, minute: 30 });

    const occ = getItemOccurrences(uid, '2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    // Jul 6 and Jul 13; Jul 20 09:00 is past the UNTIL (Jul 20 00:00) and excluded.
    expect(occ.map(o => o.start)).toEqual([
      '2026-07-06T09:00:00.000Z',
      '2026-07-13T09:00:00.000Z',
    ]);
    expect(occ.every(o => o.end === o.start.replace('T09:00', 'T10:30'))).toBe(true);
  });

  it('drops EXDATE days and adds RDATE days when expanding', () => {
    const uid = register('occuser3', 'Password123');
    // Insert a recurring row directly so we can attach EXDATE/RDATE (the iCal import path).
    createItemRow({
      uid,
      course_id: null,
      kind: 'EVENT',
      recurrence: 'RECURRING',
      title: 'Class',
      description: null,
      location: null,
      start_date: '2026-07-06T09:00:00.000Z',
      end_date: null,
      completed: null,
      start_time: '09:00:00',
      end_time: '10:30:00',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      exdate: JSON.stringify(['2026-07-13T09:00:00.000Z']), // term break
      rdate: JSON.stringify(['2026-07-16T09:00:00.000Z']),  // one-off extra (a Thursday)
      source_uid: null,
      ical_uid: null,
      created_at: new Date().toISOString(),
      updated_at: null,
    });

    const starts = getItemOccurrences(uid, '2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')
      .map(o => o.start);

    // Mondays 6/13/20/27 minus the 13 (EXDATE), plus the 16 (RDATE), sorted ascending.
    expect(starts).toEqual([
      '2026-07-06T09:00:00.000Z',
      '2026-07-16T09:00:00.000Z',
      '2026-07-20T09:00:00.000Z',
      '2026-07-27T09:00:00.000Z',
    ]);
  });

  it('expands a zoned weekly series correctly across a DST transition (wall-clock stays fixed)', () => {
    const uid = register('occtz', 'Password123');
    // Weekly Monday 09:00–10:30 in Sydney, anchored 2026-03-30 (before AU DST ends 2026-04-05).
    createItemRow({
      uid, course_id: null, kind: 'EVENT', recurrence: 'RECURRING', title: 'Lecture',
      description: null, location: null,
      start_date: '2026-03-29T22:00:00.000Z', end_date: null, completed: null,
      start_time: '09:00:00', end_time: '10:30:00',
      timezone: 'Australia/Sydney', all_day: null,
      rrule: 'FREQ=WEEKLY;BYDAY=MO', exdate: null, rdate: null,
      source_uid: null, ical_uid: null, created_at: new Date().toISOString(), updated_at: null,
    });

    const occ = getItemOccurrences(uid, '2026-03-29T00:00:00.000Z', '2026-04-14T00:00:00.000Z');
    // The underlying instant shifts +11→+10 across the boundary, but each is 9am Sydney.
    expect(occ.map(o => o.start)).toEqual([
      '2026-03-29T22:00:00.000Z', // Mar 30, +11
      '2026-04-05T23:00:00.000Z', // Apr 6,  +10
      '2026-04-12T23:00:00.000Z', // Apr 13, +10
    ]);
    expect(occ.map(o => o.end)).toEqual([
      '2026-03-29T23:30:00.000Z',
      '2026-04-06T00:30:00.000Z',
      '2026-04-13T00:30:00.000Z',
    ]);
  });

  it('spills an overnight recurring occurrence into the next day', () => {
    const uid = register('occovernight', 'Password123');
    // Weekly Monday 22:00 → 02:00 (ends after midnight) in Sydney.
    createItemRow({
      uid, course_id: null, kind: 'EVENT', recurrence: 'RECURRING', title: 'Night shift',
      description: null, location: null,
      start_date: '2026-03-30T11:00:00.000Z', end_date: null, completed: null,
      start_time: '22:00:00', end_time: '02:00:00',
      timezone: 'Australia/Sydney', all_day: null,
      rrule: 'FREQ=WEEKLY;BYDAY=MO', exdate: null, rdate: null,
      source_uid: null, ical_uid: null, created_at: new Date().toISOString(), updated_at: null,
    });

    const occ = getItemOccurrences(uid, '2026-03-30T00:00:00.000Z', '2026-03-31T00:00:00.000Z');
    expect(occ).toHaveLength(1);
    expect(occ[0].start).toBe('2026-03-30T11:00:00.000Z'); // Mon 22:00 Sydney
    expect(occ[0].end).toBe('2026-03-30T15:00:00.000Z');   // Tue 02:00 Sydney — end after start
    expect(new Date(occ[0].end).getTime()).toBeGreaterThan(new Date(occ[0].start).getTime());
  });
});
