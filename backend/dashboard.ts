import fs from 'fs';
import crypto from 'crypto';

import { User, DB, Task } from './types/types';
import AppError from './error/appError';
import { ERRORS } from './error/errors';
import { getUserFromUID } from './util';

export function createTask(title: string, UID: string, description?: string): void {
    const user = getUserFromUID(UID);
    const newTask: Task = {
        id: crypto.randomUUID(),
        title,
        description,
        completed: false
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