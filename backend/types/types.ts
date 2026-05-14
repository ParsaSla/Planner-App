export interface User {
    username: string;
    passwordHash: string;
    salt: string;
    UID: string;
    creation: string;
    lastLogin?: string;
    data: UserData;
}

export interface UserData {
    // Define the structure of user-specific data here (e.g., tasks, preferences)
    tasks?: Array<Task>;
    preferences?: Record<string, any>;
}

export interface Task {
    id: string;
    title: string;
    description?: string;
    completed: boolean;
}

export interface Session {
    UID: string;
    expires: string;
}

export interface DB {
    users: Record<string, User>;
    sessions: Record<string, Session>;
}
