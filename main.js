import { createInterface } from 'readline';
import { register, login, getUsername } from './auth.js';
import { createEvent } from './user.js';

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
        console.log("welcome", getUsername(UID));
        const choice = await ask('Q to logout, E to create event: ');

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




