import { getSQLiteDB } from './connection';

export interface UserRow {
    uid: string;
    username: string;
    password_hash: string;
    salt: string;
    created_at: string;
    last_login?: string;
}

export interface SessionRow {
    sid: string;
    uid: string;
    expires: string;
}

export function createUserRow(user: UserRow): void {
    const db = getSQLiteDB();
    db.prepare(
        `INSERT OR REPLACE INTO users (uid, username, password_hash, salt, created_at, last_login)
         VALUES (@uid, @username, @password_hash, @salt, @created_at, @last_login)`
    ).run({
        ...user,
        last_login: user.last_login ?? null,
    });
}

export function updateUserLastLogin(uid: string, lastLogin: string): void {
    const db = getSQLiteDB();
    db.prepare('UPDATE users SET last_login = @last_login WHERE uid = @uid').run({ uid, last_login: lastLogin });
}

export function getUserByUsername(username: string): UserRow | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ username: string }, UserRow>('SELECT * FROM users WHERE username = @username').get({ username });
    return row || null;
}

export function getUserByUID(uid: string): UserRow | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ uid: string }, UserRow>('SELECT * FROM users WHERE uid = @uid').get({ uid });
    return row || null;
}

export function createSession(sid: string, uid: string, expires: string): void {
    const db = getSQLiteDB();
    db.prepare('INSERT OR REPLACE INTO sessions (sid, uid, expires) VALUES (@sid, @uid, @expires)').run({ sid, uid, expires });
}

export function getSession(sid: string): SessionRow | null {
    const db = getSQLiteDB();
    const row = db.prepare<{ sid: string }, SessionRow>('SELECT * FROM sessions WHERE sid = @sid').get({ sid });
    return row || null;
}

export function deleteSession(sid: string): void {
    const db = getSQLiteDB();
    db.prepare('DELETE FROM sessions WHERE sid = @sid').run({ sid });
}
