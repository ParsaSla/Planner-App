import { readDB } from "./dbManager";
import AppError from "./error/appError";
import { ERRORS } from "./error/errors";
import { DB, User } from "./types/GeneralTypes";


export function getUserFromUID(UID: string): User {
    const db: DB = readDB();
    const user = db.users[UID];
    if (!user) {
        throw new AppError('User not found', ERRORS.INVALID_CREDENTIALS);
    }
    return user;
}

export function convertToDateObj(date: string): Date {
    let dateObj: Date;
    if (date) {
        dateObj = new Date(date);
    } else {
        throw new AppError('Date is required for one-time tasks', ERRORS.INVALID_TASK_DATA);
    }

    if (isNaN(dateObj.getTime())) {
        throw new AppError('Invalid date format', ERRORS.INVALID_TASK_DATA);
    }
    return dateObj;
}