
export class Event {
    constructor(title, date, type, description) {
        this.title = title;
        this.date = date;
        this.type = type;
        this.description = description;
        this.dateCreated = new Date().toLocaleString();
        this.completed = false;
    }
    static fromJSON(obj) {
        return Object.assign(new Event(), obj);
    }
    prettyPrint() {
        return `Title: ${this.title}\nDate: ${this.date}\nType: ${this.type}\nDescription: ${this.description}\nDate Created: ${this.dateCreated}\nCompleted: ${this.completed}`;
    }
}