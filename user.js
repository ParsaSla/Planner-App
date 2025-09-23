import fs from 'fs';
import { Event } from './event.js';

const pathname = 'userDB.json'

function readDB() {
    const data = fs.readFileSync(pathname, 'utf8');
    return JSON.parse(data);
}

function writeDB(users) {
    fs.writeFileSync(pathname, JSON.stringify(users, null, 2), 'utf8');
}

export function createEvent(UID, title, date, type, description) {
    const users = readDB();
    for (let user of users) {
        if (user.UID == UID) {
            const event = new Event(title, date, type, description);
            if (!user.events) {
                user.events = [];
            }
            user.events.push(event);
            writeDB(users);
            return true;
        }
    }
    const user = {
        UID: UID,
        events: [new Event(title, date, type, description)]
    };
    users.push(user);
    writeDB(users);
    return true;
}