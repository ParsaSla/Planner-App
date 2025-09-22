import fs from 'fs';

const pathname = 'userDB.json'

function appendDB(user) {
    fs.appendFileSync(pathname, JSON.stringify(user), 'utf8');
}
function readDB() {
    console.log(fs.readFileSync(pathname, 'utf8'));
}
function register() {
}

const user1 = {
    username: "parsa"
};
const user2 = {
    username: "Pooneh"
};
appendDB(user1);
appendDB(user2);
readDB();
