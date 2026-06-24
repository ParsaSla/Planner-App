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

// Events mirror tasks but are time-blocked: they occupy a start→end span rather
// than a single point. See backend/types/TaskTypes.ts (OneTimeEvent / RecurringEvent).
export interface OneTimeEvent extends TaskBase {
  type: 'ONE_TIME';
  start: string; // ISO-8601 datetime
  end: string; // ISO-8601 datetime
  completed: boolean;
}

export interface RecurringEvent extends TaskBase {
  type: 'RECURRING';
  days: Day[];
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  completedDates: string[]; // YYYY-MM-DD list of completed occurrences
}

export type PlannerEvent = OneTimeEvent | RecurringEvent;

export function isOneTimeEvent(e: PlannerEvent): e is OneTimeEvent {
  return e.type === 'ONE_TIME';
}
export function isRecurringEvent(e: PlannerEvent): e is RecurringEvent {
  return e.type === 'RECURRING';
}

// A task or an event — both share the TaskBase shape and a recurrence type.
export type PlannerItem = Task | PlannerEvent;

/** Structural guard: events carry start/startTime, tasks carry date/time. */
export function isEventItem(x: PlannerItem): x is PlannerEvent {
  return 'start' in x || 'startTime' in x;
}
/** True for recurring tasks or recurring events. */
export function isRecurringItem(x: PlannerItem): x is RecurringTask | RecurringEvent {
  return x.type === 'RECURRING';
}

// A concrete, dated occurrence of a task or event on the timeline (one-time
// items produce a single instance; recurring items expand into many).
export interface TaskInstance {
  item: PlannerItem;
  /** 'task' or 'event' — drives which completion/edit handlers apply. */
  kind: 'task' | 'event';
  /** Local Date for this occurrence's start (with time applied). */
  date: Date;
  /** Local Date for the occurrence's end — events only. */
  endDate?: Date;
  /** YYYY-MM-DD key in local time. */
  dateKey: string;
  completed: boolean;
  /** Present only for recurring occurrences — used to toggle completion. */
  instanceDate?: string;
  /** true when the occurrence has a concrete time-of-day. */
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

// Payload for creating/updating an event.
export interface EventInput {
  type: TaskType;
  title: string;
  description?: string;
  start?: string; // for ONE_TIME — datetime ("YYYY-MM-DDTHH:mm")
  end?: string; // for ONE_TIME — datetime ("YYYY-MM-DDTHH:mm")
  days?: Day[]; // for RECURRING
  startTime?: TimeOfDay; // for RECURRING
  endTime?: TimeOfDay; // for RECURRING
  courseId?: string;
}

export interface GroupInput {
  name: string;
  code?: string;
  color?: string;
}
