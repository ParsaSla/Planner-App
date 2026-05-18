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