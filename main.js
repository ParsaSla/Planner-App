import { createInterface } from 'readline';
import { register, login, getUsername } from './auth.js';
import { createEvent, readEvents, deleteEvent } from './user.js';

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
}

let UID = -1;

while (true) {

    if (UID != -1) {
        console.log('------------------');
        console.log();
        console.log("welcome", getUsername(UID));
        const choice = await ask('Q to logout, E to create event, R to read events, D to delete event: ');

        if (choice == 'Q') {
            UID = -1;
        }
        else if (choice == 'E') {
            const title = await ask('Title: ');
            const date = await ask('Date: ');
            const type = await ask('Type: ');
            const description = await ask('Description: ');
            createEvent(UID, title, date, type, description);
            console.log('Event created succesfully');
        }
        else if (choice == 'R') {
            const events = readEvents(UID);
            for (let event of events) {
                console.log('------------------');
                console.log(event.prettyPrint());
                console.log('------------------');
            }
            if (events.length == 0) {
                console.log('No events found');
            }
        }
        else if (choice == 'D') {
            const events = readEvents(UID);
            for (let event of events) {
                console.log('------------------');
                console.log(event.prettyPrint());
                console.log('------------------');
            }
            if (events.length == 0) {
                console.log('No events found');
            }
            else {
                const index = await ask('Event index to delete (starting from 0): ');
                if (deleteEvent(UID, parseInt(index))) {
                    console.log('Event deleted succesfully');
                }
                else {
                    console.log('Invalid index');
                }
            }
        }
    }

    else {
        const choice = await ask('L to login, C to create account: ');

        if (choice == 'C') {
            const username = await ask('Username: ');
            const password = await ask('Password: ');
            
            UID = register(username, password);
            if (UID) {
                console.log('Account created succesfully');
            }
            else {
                console.log('Username already exists, try again');
            }
        }
        else if (choice == 'L') {
            const username = await ask('Username: ');
            const password = await ask('Password: ');

            UID = login(username, password);
            if (UID == -1) {
                console.log('Incorrect username or password');
            }
        }
    }
}




