import fs from 'fs';
import crypto from 'crypto';

import { User, DB, TimeOfDay, DAY } from './types/GeneralTypes';
import { OneTimeTask, RecurringTask, Task, TASKS } from './types/TaskTypes';
import AppError from './error/appError';
import { ERRORS } from './error/errors';
import { getUserFromUID } from './util';

export function createOneTimeTask(title: string, UID: string, date: Date, description?: string): void {
    const user = getUserFromUID(UID);
    const newTask: OneTimeTask = {
        id: crypto.randomUUID(),
        title,
        description,
        type: TASKS.ONE_TIME,
        date,
        completed: false
    };

    if (!user.data.tasks) {
        user.data.tasks = [];
    }
    user.data.tasks.push(newTask);
}

export function createRecurringTask(title: string, UID: string, days: Array<DAY>, time: TimeOfDay, description?: string): void {
    const user = getUserFromUID(UID);
    const newTask: RecurringTask = {
        id: crypto.randomUUID(),
        title,
        description,
        type: TASKS.RECURRING,
        days,
        time
    };

    if (!user.data.tasks) {
        user.data.tasks = [];
    }
    user.data.tasks.push(newTask);
}

export function getTasks(UID: string): Task[] {
    const user = getUserFromUID(UID);
    return user.data.tasks || [];
}

export function deleteTask(UID: string, taskId: string): void {
    const user = getUserFromUID(UID);
    if (!user.data.tasks) {
        throw new AppError('No tasks found for user', ERRORS.TASK_NOT_FOUND);
    }
    user.data.tasks = user.data.tasks.filter(task => task.id !== taskId);
}