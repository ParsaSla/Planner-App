// Shared types — mirror the backend JSON contract exactly.
// See backend/types/TaskTypes.ts and backend/API.ts.

export const DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export type Day = (typeof DAYS)[number];

export type TaskType = 'ONE_TIME' | 'RECURRING';

export interface TimeOfDay {
  hour: number; // 0-23
  minute: number; // 0-59
}

export interface Group {
  id: string;
  name: string;
  code?: string;
  color?: string;
}

interface TaskBase {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  course_id?: string;
}

export interface OneTimeTask extends TaskBase {
  type: 'ONE_TIME';
  date: string; // ISO-8601 string
  completed: boolean;
}

export interface RecurringTask extends TaskBase {
  type: 'RECURRING';
  days: Day[];
  time: TimeOfDay;
  completedDates: string[]; // YYYY-MM-DD list of completed occurrences
}

export type Task = OneTimeTask | RecurringTask;

export function isRecurring(t: Task): t is RecurringTask {
  return t.type === 'RECURRING';
}
export function isOneTime(t: Task): t is OneTimeTask {
  return t.type === 'ONE_TIME';
}

// A concrete, dated occurrence of a task on the timeline (one-time tasks
// produce a single instance; recurring tasks expand into many).
export interface TaskInstance {
  task: Task;
  /** Local Date for this occurrence (with time applied). */
  date: Date;
  /** YYYY-MM-DD key in local time. */
  dateKey: string;
  completed: boolean;
  /** Present only for recurring occurrences — used to toggle completion. */
  instanceDate?: string;
  /** true for timed recurring occurrences. */
  hasTime: boolean;
}

// Payload for creating/updating a task.
export interface TaskInput {
  type: TaskType;
  title: string;
  description?: string;
  date?: string; // for ONE_TIME (YYYY-MM-DD)
  days?: Day[]; // for RECURRING
  time?: TimeOfDay; // for RECURRING
  courseId?: string;
}

export interface GroupInput {
  name: string;
  code?: string;
  color?: string;
}
