import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDB, closeDB } from '../../backend/dbManager';
import { register } from '../../backend/auth';
import { createTask, getTasks, deleteTask } from '../../backend/API';
import { TASKS } from '../../backend/types/TaskTypes';

describe('backend/API', () => {
  beforeEach(() => {
    closeDB();
    initializeDB(':memory:');
  });

  afterEach(() => {
    closeDB();
  });

  it('creates, retrieves, and deletes one-time and recurring tasks', () => {
    const uid = register('apitestuser', 'Password123');

    createTask(
      TASKS.ONE_TIME,
      'Submit report',
      uid,
      '2026-07-01',
      [],
      { hour: 0, minute: 0 },
      'Finish the assignment',
    );

    createTask(
      TASKS.RECURRING,
      'Weekly review',
      uid,
      '',
      ['FRIDAY'],
      { hour: 10, minute: 30 },
      'Weekly study session',
    );

    const tasks = getTasks(uid);
    expect(tasks.length).toBe(2);
    expect(tasks.some(task => task.type === TASKS.ONE_TIME)).toBe(true);
    expect(tasks.some(task => task.type === TASKS.RECURRING)).toBe(true);

    const taskToDelete = tasks.find(task => task.type === TASKS.ONE_TIME);
    expect(taskToDelete).toBeTruthy();

    deleteTask(uid, taskToDelete!.id);
    const remainingTasks = getTasks(uid);
    expect(remainingTasks.length).toBe(1);
    expect(remainingTasks[0].type).toBe(TASKS.RECURRING);
  });
});
