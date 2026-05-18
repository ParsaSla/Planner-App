import fs from 'fs';
import crypto from 'crypto';

import { User, DB } from './types/GeneralTypes';
import AppError from './error/appError';
import { ERRORS } from './error/errors';
import { readDB, writeDB } from './dbManager';

function addUser(user: User): void {
    const db = readDB();
    db.users[user.UID] = user;
}

export function register(username: string, password: string): string {
    username = username.toLowerCase();
    const db: DB = readDB();

    if (Object.values(db.users).some(user => user.username === username)) {
        throw new AppError('User already exists', ERRORS.USER_ALREADY_EXISTS);
    }

    const user = createUser(username, password);
    addUser(user);
    return user.UID;
}

function createUser(username: string, password: string): User {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

    const user = {
        username: username,
        passwordHash: hash,
        salt: salt,
        UID: generateUID(),
        creation: new Date().toLocaleString(),
        data: {}
    };
    return user;
}

function generateUID() {
    return crypto.randomUUID();
}

export function login(username: string, password: string) {
    username = username.toLowerCase();
    const db: DB = readDB();
    const user = Object.values(db.users).find(u => u.username === username);
    if (user) {
        const hash = crypto.pbkdf2Sync(password, user.salt, 1000, 64, 'sha512').toString('hex');
        if (hash == user.passwordHash) {
            user.lastLogin = new Date().toLocaleString();

            const session = {
                UID: user.UID,
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString() // Expires in 24 hours
            };
            const SID = crypto.randomUUID();
            db.sessions[SID] = session;

            return SID; // Return session ID on successful login
        }
    } 
    throw new AppError('Invalid credentials', ERRORS.INVALID_CREDENTIALS);
}

export function validateSession(SID: string): string {
    const db: DB = readDB();
    const session = db.sessions[SID];
    if (session) {
        const now = new Date();
        const expires = new Date(session.expires);
        if (now < expires) {
            return session.UID; // Return UID if session is valid
        } else {
            delete db.sessions[SID]; // Remove expired session
        }
    }
    throw new AppError('Invalid session', ERRORS.INVALID_CREDENTIALS);
}

export function deleteSession(SID: string) {
    const db: DB = readDB();
    if (db.sessions[SID]) {
        delete db.sessions[SID];
    }
}

// export function getUsername(UID: string) {
//     const users = readDB();
//     return users.find(user => user.UID === UID)?.username;
// }

// appendDB(user1);
// appendDB(user2);
// readDB();

//console.log(createUser("ps","pp"));