
export class Event {
    constructor(title, date, type, description) {
        this.title = title;
        this.date = date;
        this.type = type;
        this.description = description;
        this.dateCreated = new Date().toLocaleString();
        this.completed = false;
    }
}