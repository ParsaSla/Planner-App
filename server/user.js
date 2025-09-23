import fs from 'fs';
import { Event } from './event.js';

const pathname = 'users/'

function readUser(UID) {
    try {
        let data = fs.readFileSync(pathname + UID + '.json', 'utf8');
        data = JSON.parse(data);
        if (data.events) {
            data.events = data.events.map(event => Event.fromJSON(event));
        }
        return data;
    }
    catch (err){
        return null;
    }
}

function writeUser(user) {
    try {   
        fs.writeFileSync(pathname + user.UID + '.json', JSON.stringify(user, null, 2), 'utf8');
        return true;
    }
    catch (err) {
        return false;
    }
}

export function createEvent(UID, title, date, type, description) {
    let user = readUser(UID);

    if (user == null) {
        user = {
            UID: UID,
            events: [new Event(title, date, type, description)]
        };
        return writeUser(user);
    }
    else {
        const event = new Event(title, date, type, description);
        if (!user.events) {
            user.events = [];
        }
        user.events.push(event);
        return writeUser(user);
    }
}

export function deleteEvent(UID, eventIndex) {
    const user = readUser(UID);
    if (user == null || !user.events || eventIndex < 0 || eventIndex >= user.events.length) {
        return false;
    }
    user.events.splice(eventIndex, 1);
    return writeUser(user);
}

export function readEvents(UID) {
    const user = readUser(UID);
    if (user == null || !user.events) {
        return [];
    }
    return user.events;
}