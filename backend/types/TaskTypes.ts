import { DAY, TimeOfDay } from "./GeneralTypes";

export const TASKS = {
    ONE_TIME: 'ONE_TIME',
    RECURRING: 'RECURRING',
};
export type TaskType = typeof TASKS[keyof typeof TASKS];

export interface Task {
    id: string;
    title: string;
    description?: string;
    type: TaskType;
}

export interface OneTimeTask extends Task {
    date: Date;
    completed: boolean;
}

export interface RecurringTask extends Task {
    days: Array<DAY>;
    time: TimeOfDay;
}

export function assertTaskType(value: any): void {
  if (!Object.values(TASKS).includes(value)) {
    throw new Error('Invalid task type');
  }
}