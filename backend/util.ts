import AppError from "./error/appError";
import { ERRORS } from "./error/errors";


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