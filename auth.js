import fs from 'fs';

const pathname = 'userDB.json'

function appendDB(user) {
    const users = readDB();
    users.push(user);
    fs.writeFileSync(pathname, JSON.stringify(users, null, 2), 'utf8');
}

function readDB() {
    const data = fs.readFileSync(pathname, 'utf8');
    return JSON.parse(data);
}

export function register(username, password) {
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

function createUser(username, password) {
    const user = {
        username: username,
        password: password,
        UID: generateUID()
    };
    return user;
}

function generateUID() {
    const users = readDB();
    if (users.length == 0) {
        return 1;
    }
    const lastUID = users.at(-1).UID;
    return lastUID + 1;
}

// appendDB(user1);
// appendDB(user2);
// readDB();

//console.log(createUser("ps","pp"));