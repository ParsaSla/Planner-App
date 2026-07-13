import { getUserByUID } from '../db/users';
import AppError from '../error/appError';
import { ERRORS } from '../error/errors';

/** Throws if no user exists for the given UID. */
export function requireUser(UID: string): void {
    if (!getUserByUID(UID)) {
        throw new AppError('User not found', ERRORS.INVALID_CREDENTIALS);
    }
}
