import { DAY, TimeOfDay } from "./GeneralTypes";

export const TASKS = {
    ONE_TIME: 'ONE_TIME',
    RECURRING: 'RECURRING',
};
export type TaskType = typeof TASKS[keyof typeof TASKS];

export interface Course {
    id: string;
    name: string;
    code?: string;
    color?: string;
}

export interface Task {
    id: string;
    title: string;
    description?: string;
    type: TaskType;
    course_id?: string;
}

export interface OneTimeTask extends Task {
    date: Date;
    completed: boolean;
}

export interface RecurringTask extends Task {
    days: Array<DAY>;
    time: TimeOfDay;
    completedDates: string[];
}

export function assertTaskType(value: any): void {
  if (!Object.values(TASKS).includes(value)) {
    throw new Error('Invalid task type');
  }
}