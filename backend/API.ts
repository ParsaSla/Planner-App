import crypto from 'crypto';

import { TimeOfDay, DAY, assertDaysType, assertTimeOfDayType } from './types/GeneralTypes';
import { assertTaskType, Task, TASKS, TaskType } from './types/TaskTypes';
import AppError from './error/appError';
import { ERRORS } from './error/errors';
import { convertToDateObj } from './util';
import {
    createOneTimeTaskRow,
    createRecurringTaskRow,
    getOneTimeTasksByUID,
    getRecurringTasksByUID,
    deleteTaskById,
    updateOneTimeTaskCompletion,
    getUserByUID,
} from './dbManager';

export function createOneTimeTask(title: string, UID: string, date: Date, description?: string): void {
    const user = getUserByUID(UID);
    if (!user) {
        throw new AppError('User not found', ERRORS.INVALID_CREDENTIALS);
    }

    createOneTimeTaskRow({
        id: crypto.randomUUID(),
        uid: UID,
        title,
        description,
        type: TASKS.ONE_TIME,
        date: date.toISOString(),
        completed: 0,
        created_at: new Date().toISOString(),
    });
}

export function createRecurringTask(title: string, UID: string, days: Array<DAY>, time: TimeOfDay, description?: string): void {
    const user = getUserByUID(UID);
    if (!user) {
        throw new AppError('User not found', ERRORS.INVALID_CREDENTIALS);
    }

    assertDaysType(days);
    assertTimeOfDayType(time);

    createRecurringTaskRow({
        id: crypto.randomUUID(),
        uid: UID,
        title,
        description,
        days_of_week: JSON.stringify(days),
        time_hour: time.hour,
        time_minute: time.minute,
        active: 1,
        created_at: new Date().toISOString(),
    });
}

export function createTask(type: TaskType, title: string, UID: string, date: string, days: Array<DAY>, time: TimeOfDay, description?: string): void {
    assertTaskType(type);

    if (type === TASKS.ONE_TIME) {
        const dateObj = convertToDateObj(date);
        createOneTimeTask(title, UID, dateObj, description);
    } else if (type === TASKS.RECURRING) {
        assertDaysType(days);
        assertTimeOfDayType(time);
        createRecurringTask(title, UID, days, time, description);
    }
}

export function getTasks(UID: string): Task[] {
    const user = getUserByUID(UID);
    if (!user) {
        throw new AppError('User not found', ERRORS.INVALID_CREDENTIALS);
    }

    return [...getOneTimeTasksByUID(UID), ...getRecurringTasksByUID(UID)];
}

export function deleteTask(UID: string, taskId: string): void {
    const user = getUserByUID(UID);
    if (!user) {
        throw new AppError('User not found', ERRORS.INVALID_CREDENTIALS);
    }

    const deletedCount = deleteTaskById(UID, taskId);
    if (deletedCount === 0) {
        throw new AppError('Task not found', ERRORS.TASK_NOT_FOUND);
    }
}

export function updateTaskCompletion(UID: string, taskId: string, completed: boolean): void {
    const user = getUserByUID(UID);
    if (!user) {
        throw new AppError('User not found', ERRORS.INVALID_CREDENTIALS);
    }

    const updatedCount = updateOneTimeTaskCompletion(UID, taskId, completed ? 1 : 0);
    if (updatedCount === 0) {
        throw new AppError('Task not found', ERRORS.TASK_NOT_FOUND);
    }
}