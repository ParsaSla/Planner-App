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

function createUser(username: string, password: string): UserRow {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

    return {
        username,
        password_hash: hash,
        salt,
        uid: generateUID(),
        created_at: new Date().toISOString(),
    };
}

export function register(username: string, password: string): string {
    username = username.toLowerCase();
    const existingUser = getUserByUsername(username);
    if (existingUser) {
        throw new AppError('User already exists', ERRORS.USER_ALREADY_EXISTS);
    }

    const userRecord = createUser(username, password);
    createUserRow(userRecord);
    return userRecord.uid;
}

function generateUID() {
    return crypto.randomUUID();
}

export function login(username: string, password: string) {
    username = username.toLowerCase();
    const user = getUserByUsername(username);
    if (!user) {
        throw new AppError('Invalid credentials', ERRORS.INVALID_CREDENTIALS);
    }

    const hash = crypto.pbkdf2Sync(password, user.salt, 1000, 64, 'sha512').toString('hex');
    if (hash !== user.password_hash) {
        throw new AppError('Invalid credentials', ERRORS.INVALID_CREDENTIALS);
    }

    const sid = crypto.randomUUID();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
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

export function deleteSession(SID: string) {
    removeSession(SID);
}

// export function getUsername(UID: string) {
//     const users = readDB();
//     return users.find(user => user.UID === UID)?.username;
// }

// appendDB(user1);
// appendDB(user2);
// readDB();

//console.log(createUser("ps","pp"));