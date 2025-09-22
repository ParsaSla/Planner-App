import { createInterface } from 'readline';
import { register } from './auth.js';

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
}

while (true) {
    const choice = await ask('L to login, C to create account: ');

    if (choice == 'C') {
        const username = await ask('Username: ');
        const password = await ask('Password: ');
        
        const UID = register(username, password);
        if (UID) {
            console.log('Account created succesfully');
        }
        else {
            console.log('Username already exists, try again');
        }
    }
}




