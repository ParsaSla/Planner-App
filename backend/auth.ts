import crypto from 'crypto';

import AppError from './error/appError';
import { ERRORS } from './error/errors';
import {
    createUserRow,
    getUserByUsername,
    createSession,
    getSession,
    deleteSession as removeSession,
    updateUserLastLogin,
} from './dbManager';
import { UserRow } from './types/DBTypes';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

const PASSWORD_RULES: { test: (pw: string) => boolean; message: string }[] = [
    { test: (pw) => pw.length >= 8, message: 'at least 8 characters' },
    { test: (pw) => /[A-Z]/.test(pw), message: 'an uppercase letter' },
    { test: (pw) => /[a-z]/.test(pw), message: 'a lowercase letter' },
    { test: (pw) => /[0-9]/.test(pw), message: 'a number' },
];

function validatePassword(password: string): void {
    const failed = PASSWORD_RULES.filter(({ test }) => !test(password));
    if (failed.length > 0) {
        const requirements = failed.map(({ message }) => message).join(', ');
        throw new AppError(`Password must contain ${requirements}.`, ERRORS.INVALID_PASSWORD);
    }
}

function createUser(username: string, password: string): UserRow {
    const salt = crypto.randomBytes(16).toString('hex');

    return {
        username,
        password_hash: hashPassword(password, salt),
        salt,
        uid: crypto.randomUUID(),
        created_at: new Date().toISOString(),
    };
}

export function register(username: string, password: string): string {
    username = username.toLowerCase();
    const existingUser = getUserByUsername(username);
    if (existingUser) {
        throw new AppError('User already exists', ERRORS.USER_ALREADY_EXISTS);
    }

    validatePassword(password);

    const userRecord = createUser(username, password);
    createUserRow(userRecord);
    return userRecord.uid;
}

export function login(username: string, password: string): string {
    username = username.toLowerCase();
    const user = getUserByUsername(username);
    if (!user) {
        throw new AppError('Invalid credentials', ERRORS.INVALID_CREDENTIALS);
    }

    if (hashPassword(password, user.salt) !== user.password_hash) {
        throw new AppError('Invalid credentials', ERRORS.INVALID_CREDENTIALS);
    }

    const sid = crypto.randomUUID();
    const expires = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    createSession(sid, user.uid, expires);
    updateUserLastLogin(user.uid, new Date().toISOString());

    return sid;
}

export function validateSession(SID: string): string {
    const session = getSession(SID);
    if (!session) {
        throw new AppError('Invalid session', ERRORS.INVALID_CREDENTIALS);
    }

    const now = new Date();
    const expires = new Date(session.expires);
    if (now < expires) {
        return session.uid;
    }

    removeSession(SID);
    throw new AppError('Invalid session', ERRORS.INVALID_CREDENTIALS);
}

export function deleteSession(SID: string): void {
    removeSession(SID);
}