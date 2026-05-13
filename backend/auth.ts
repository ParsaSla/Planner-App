import fs from 'fs';

import { User } from './types/user.types.js';

const pathname = 'data/authDB.json';

function appendDB(user: User) {
    const users = readDB();
    users.push(user);
    fs.writeFileSync(pathname, JSON.stringify(users, null, 2), 'utf8');
}

function readDB() {
    const data = fs.readFileSync(pathname, 'utf8');
    return JSON.parse(data);
}

function writeDB(users: User[]) {
    fs.writeFileSync(pathname, JSON.stringify(users, null, 2), 'utf8');
}

export function register(username: string, password: string) {
    username = username.toLowerCase();
    const users = readDB();
    for (let user of users) {
        if (user.username === username) {
            return false;
        }
    }
    const user = createUser(username, password);
    appendDB(user);
    return user.UID;
}

function createUser(username: string, password: string): User {
    const user = {
        username: username,
        password: password,
        UID: generateUID(),
        creation: new Date().toLocaleString()
    };
    return user;
}

function generateUID() {
    const users = readDB();
    if (users.length == 0) {
        return -1;
    }
    const lastUID = users.at(-1).UID;
    return lastUID + 1;
}

export function login(username: string, password: string) {
    username = username.toLowerCase();
    const users = readDB();
    for (let user of users) {
        if (user.username == username && user.password == password) {
            user.lastLogin = new Date().toLocaleString();
            writeDB(users);
            return user.UID;
        }
    }
    return null;
}

export function getUsername(UID: number) {
    const users = readDB();
    return users[UID].username;
}

// appendDB(user1);
// appendDB(user2);
// readDB();

//console.log(createUser("ps","pp"));