// import { Task } from './TaskTypes';

// export interface User {
//     username: string;
//     passwordHash: string;
//     salt: string;
//     UID: string;
//     creation: string;
//     lastLogin?: string;
//     data: UserData;
// }

// export interface UserData {
//     // Define the structure of user-specific data here (e.g., tasks, preferences)
//     tasks?: Array<Task>;
//     preferences?: Record<string, any>;
// }

// export interface Session {
//     UID: string;
//     expires: string;
// }

// export interface DB {
//     users: Record<string, User>;
//     sessions: Record<string, Session>;
// }

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

export function assertDaysType(days: Array<DAY>): void {
  for (const day of days) {
    if (!Object.values(DAYS).includes(day)) {
      throw new Error('Invalid day type');
    }
  }
}

export interface TimeOfDay {
    hour: number; // 0-23
    minute: number; // 0-59
}

export function assertTimeOfDayType(time: TimeOfDay): void {
    if (time.hour < 0 || time.hour > 23) {
        throw new Error('Invalid hour value');
    }
    if (time.minute < 0 || time.minute > 59) {
        throw new Error('Invalid minute value');
    }
}