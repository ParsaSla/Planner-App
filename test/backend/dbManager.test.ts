import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeDB,
  closeDB,
  createUserRow,
  getUserByUsername,
  getUserByUID,
  updateUserLastLogin,
  createSession,
  getSession,
  deleteSession,
  createOneTimeTaskRow,
  createRecurringTaskRow,
  getOneTimeTasksByUID,
  getRecurringTasksByUID,
  deleteTaskById,
} from '../../backend/dbManager';
import { UserRow } from '../../backend/types/DBTypes';

describe('backend/dbManager', () => {
  beforeEach(() => {
    closeDB();
    initializeDB(':memory:');
  });

  afterEach(() => {
    closeDB();
  });

  it('creates and reads users correctly', () => {
    const user: UserRow = {
      uid: 'uid-test',
      username: 'testuser',
      password_hash: 'hash',
      salt: 'salt',
      created_at: new Date().toISOString(),
    };

    createUserRow(user);

    const byUsername = getUserByUsername('testuser');
    const byUid = getUserByUID('uid-test');

    expect(byUsername).toBeTruthy();
    expect(byUsername?.uid).toBe('uid-test');
    expect(byUid).toBeTruthy();
    expect(byUid?.username).toBe('testuser');
  });

  it('updates last login and manages sessions', () => {
    const user: UserRow = {
      uid: 'uid-session',
      username: 'sessionuser',
      password_hash: 'hash',
      salt: 'salt',
      created_at: new Date().toISOString(),
    };

    createUserRow(user);

    const lastLogin = '2026-06-14T12:00:00.000Z';
    updateUserLastLogin('uid-session', lastLogin);
    expect(getUserByUID('uid-session')?.last_login).toBe(lastLogin);

    createSession('sid-test', 'uid-session', '2099-01-01T00:00:00.000Z');
    const session = getSession('sid-test');
    expect(session).toBeTruthy();
    expect(session?.uid).toBe('uid-session');

    deleteSession('sid-test');
    expect(getSession('sid-test')).toBeNull();
  });

  it('creates one-time and recurring tasks and deletes them correctly', () => {
    const user: UserRow = {
      uid: 'uid-task',
      username: 'taskuser',
      password_hash: 'hash',
      salt: 'salt',
      created_at: new Date().toISOString(),
    };

    createUserRow(user);

    createOneTimeTaskRow({
      id: 'one-time-task',
      uid: 'uid-task',
      title: 'One-time task',
      description: 'Test task',
      type: 'ONE_TIME',
      date: '2026-06-20T00:00:00.000Z',
      completed: 0,
      created_at: new Date().toISOString(),
    });

    createRecurringTaskRow({
      id: 'recurring-task',
      uid: 'uid-task',
      title: 'Recurring task',
      description: 'Weekly meeting',
      days_of_week: JSON.stringify(['MONDAY', 'WEDNESDAY']),
      time_hour: 9,
      time_minute: 30,
      active: 1,
      created_at: new Date().toISOString(),
    });

    const oneTimeTasks = getOneTimeTasksByUID('uid-task');
    const recurringTasks = getRecurringTasksByUID('uid-task');

    expect(oneTimeTasks).toHaveLength(1);
    expect(oneTimeTasks[0].title).toBe('One-time task');
    expect(oneTimeTasks[0].completed).toBe(false);
    expect(recurringTasks).toHaveLength(1);
    expect(recurringTasks[0].title).toBe('Recurring task');
    expect(recurringTasks[0].days).toEqual(['MONDAY', 'WEDNESDAY']);

    const deletedCount = deleteTaskById('uid-task', 'one-time-task');
    expect(deletedCount).toBe(1);
    expect(getOneTimeTasksByUID('uid-task')).toHaveLength(0);
  });
});
