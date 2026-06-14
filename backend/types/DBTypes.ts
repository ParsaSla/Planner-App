export interface UserRow {
    uid: string;
    username: string;
    password_hash: string;
    salt: string;
    created_at: string;
    last_login?: string;
}

export interface SessionRow {
    sid: string;
    uid: string;
    expires: string;
}

export interface TaskRow {
    id: string;
    uid: string;
    title: string;
    description?: string;
    type: string;
    date?: string;
    completed: number;
    created_at: string;
    updated_at?: string;
}

export interface RecurringTaskRow {
    id: string;
    uid: string;
    title: string;
    description?: string;
    days_of_week?: string;
    time_hour?: number;
    time_minute?: number;
    active: number;
    created_at: string;
    updated_at?: string;
}
