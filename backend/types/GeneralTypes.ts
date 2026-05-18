import { Task } from './TaskTypes';

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

export interface Session {
    UID: string;
    expires: string;
}

export interface DB {
    users: Record<string, User>;
    sessions: Record<string, Session>;
}

export const DAYS = {
    SATURDAY: 'SATURDAY',
    SUNDAY: 'SUNDAY',
    MONDAY: 'MONDAY',
    TUESDAY: 'TUESDAY',
    WEDNESDAY: 'WEDNESDAY',
    THURSDAY: 'THURSDAY',
    FRIDAY: 'FRIDAY',
};
export type DAY = typeof DAYS[keyof typeof DAYS];

export interface TimeOfDay {
    hour: number; // 0-23
    minute: number; // 0-59
}