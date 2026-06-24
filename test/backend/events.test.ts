import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDB, closeDB } from '../../backend/dbManager';
import { register } from '../../backend/auth';
import {
  createEvent,
  getEvents,
  deleteEvent,
  updateEvent,
  updateEventCompletion,
  toggleRecurringEventInstance,
} from '../../backend/API';
import { TASKS, OneTimeEvent, RecurringEvent } from '../../backend/types/TaskTypes';

describe('backend/API events', () => {
  beforeEach(() => {
    closeDB();
    initializeDB(':memory:');
  });

  afterEach(() => {
    closeDB();
  });

  it('creates, retrieves, and deletes one-time and recurring events', () => {
    const uid = register('eventuser', 'Password123');

    createEvent(
      TASKS.ONE_TIME,
      'Exam',
      uid,
      '2026-07-01T09:00:00.000Z',
      '2026-07-01T11:00:00.000Z',
      [],
      { hour: 0, minute: 0 },
      { hour: 0, minute: 0 },
      'Final exam',
    );

    createEvent(
      TASKS.RECURRING,
      'Lecture',
      uid,
      '',
      '',
      ['MONDAY', 'WEDNESDAY'],
      { hour: 9, minute: 0 },
      { hour: 10, minute: 30 },
      'Weekly lecture',
    );

    const events = getEvents(uid);
    expect(events.length).toBe(2);

    const oneTime = events.find(e => e.type === TASKS.ONE_TIME) as OneTimeEvent;
    const recurring = events.find(e => e.type === TASKS.RECURRING) as RecurringEvent;
    expect(oneTime).toBeTruthy();
    expect(recurring).toBeTruthy();
    expect(new Date(oneTime.start).toISOString()).toBe('2026-07-01T09:00:00.000Z');
    expect(new Date(oneTime.end).toISOString()).toBe('2026-07-01T11:00:00.000Z');
    expect(recurring.days).toEqual(['MONDAY', 'WEDNESDAY']);
    expect(recurring.startTime).toEqual({ hour: 9, minute: 0 });
    expect(recurring.endTime).toEqual({ hour: 10, minute: 30 });

    deleteEvent(uid, oneTime.id);
    const remaining = getEvents(uid);
    expect(remaining.length).toBe(1);
    expect(remaining[0].type).toBe(TASKS.RECURRING);
  });

  it('rejects a one-time event whose end is before its start', () => {
    const uid = register('eventuser2', 'Password123');
    expect(() =>
      createEvent(
        TASKS.ONE_TIME,
        'Bad event',
        uid,
        '2026-07-01T11:00:00.000Z',
        '2026-07-01T09:00:00.000Z',
        [],
        { hour: 0, minute: 0 },
        { hour: 0, minute: 0 },
      ),
    ).toThrow();
  });

  it('updates events and tracks completion', () => {
    const uid = register('eventuser3', 'Password123');

    createEvent(
      TASKS.ONE_TIME,
      'Workshop',
      uid,
      '2026-07-01T09:00:00.000Z',
      '2026-07-01T11:00:00.000Z',
      [],
      { hour: 0, minute: 0 },
      { hour: 0, minute: 0 },
    );

    let oneTime = getEvents(uid).find(e => e.type === TASKS.ONE_TIME) as OneTimeEvent;
    updateEvent(
      uid,
      oneTime.id,
      TASKS.ONE_TIME,
      'Workshop (updated)',
      'New description',
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T15:00:00.000Z',
    );

    oneTime = getEvents(uid).find(e => e.type === TASKS.ONE_TIME) as OneTimeEvent;
    expect(oneTime.title).toBe('Workshop (updated)');
    expect(new Date(oneTime.start).toISOString()).toBe('2026-07-02T13:00:00.000Z');

    updateEventCompletion(uid, oneTime.id, true);
    oneTime = getEvents(uid).find(e => e.type === TASKS.ONE_TIME) as OneTimeEvent;
    expect(oneTime.completed).toBe(true);
  });

  it('toggles recurring event instance completion', () => {
    const uid = register('eventuser4', 'Password123');

    createEvent(
      TASKS.RECURRING,
      'Standup',
      uid,
      '',
      '',
      ['MONDAY'],
      { hour: 9, minute: 0 },
      { hour: 9, minute: 15 },
    );

    const recurring = getEvents(uid).find(e => e.type === TASKS.RECURRING) as RecurringEvent;
    toggleRecurringEventInstance(uid, recurring.id, '2026-07-06', true);

    let refreshed = getEvents(uid).find(e => e.type === TASKS.RECURRING) as RecurringEvent;
    expect(refreshed.completedDates).toContain('2026-07-06');

    toggleRecurringEventInstance(uid, recurring.id, '2026-07-06', false);
    refreshed = getEvents(uid).find(e => e.type === TASKS.RECURRING) as RecurringEvent;
    expect(refreshed.completedDates).not.toContain('2026-07-06');
  });
});
