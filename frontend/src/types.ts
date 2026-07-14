// Shared types — mirror the backend JSON contract exactly.
// See backend/api/items.ts and server.ts (the unified /api/items API).

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

// The one remaining axis: a one-time item is a datetime span; a recurring item
// repeats on selected weekdays. There is no task/event split anymore.
export type Recurrence = 'ONE_TIME' | 'RECURRING';

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

/**
 * A raw source item as returned by `GET /api/items` — the underlying record the
 * edit form and list/smart views read. Recurring items expose their selected
 * `daysOfWeek` (derived from the stored RRULE) plus the series' start/end dates
 * and times; one-time items carry a concrete `start_date`/`end_date` span.
 */
export interface Item {
  id: string;
  courseId?: string;
  title: string;
  description?: string;
  location?: string;
  recurrence: Recurrence;
  start_date: string; // ISO-8601 absolute UTC instant
  end_date?: string; // ISO-8601 absolute UTC instant
  daysOfWeek?: Day[]; // RECURRING only
  start_time?: TimeOfDay; // RECURRING only — wall-clock in `timezone`
  end_time?: TimeOfDay; // RECURRING only — wall-clock in `timezone`
  timezone?: string; // IANA TZID the wall-clock/recurrence is expressed in
  allDay?: boolean;
  completed?: boolean; // ONE_TIME only
  completedDates?: string[]; // RECURRING only — completed occurrence start instants (ISO-8601)
}

/**
 * A concrete dated occurrence as returned by `GET /api/items/occurrences` — the
 * server expands recurring items into one occurrence per matching day. `id` is
 * the source item's id (shared across a series), so edits route back to it.
 */
export interface ItemOccurrence {
  id: string;
  courseId?: string;
  title: string;
  description?: string;
  location?: string;
  recurrence: Recurrence;
  start: string; // ISO-8601 absolute UTC instant
  end: string; // ISO-8601 absolute UTC instant
  allDay?: boolean;
  completed: boolean; // whether this occurrence is ticked off
}

/** The one remaining discriminator on a raw item. */
export function isRecurringItem(i: Item): boolean {
  return i.recurrence === 'RECURRING';
}

// Payload for creating/updating an item (POST/PUT body).
export interface ItemInput {
  courseId?: string;
  recurrence: Recurrence;
  title: string;
  description?: string;
  location?: string;
  start_date?: string; // ONE_TIME span start / RECURRING series anchor
  end_date?: string; // ONE_TIME span end / RECURRING series UNTIL
  daysOfWeek?: Day[]; // RECURRING
  start_time?: TimeOfDay; // RECURRING
  end_time?: TimeOfDay; // RECURRING
  timezone?: string; // IANA TZID the item's times are expressed in
}

export interface GroupInput {
  name: string;
  code?: string;
  color?: string;
}

// ---- iCal import (mirrors backend/ical.ts and backend/API.ts) ----

export interface ParsedICalEvent {
  sourceUid: string;
  summary: string;
  description?: string;
  location?: string;
  start: string; // ISO-8601 absolute UTC instant
  end: string; // ISO-8601 absolute UTC instant
  timezone?: string;
  allDay?: boolean;
  detectedCode?: string;
  detectedName?: string;
}

export interface ProposedCourse {
  key: string;
  code?: string;
  name: string;
  suggestedColor: string;
  matchedCourseId?: string;
  eventCount: number;
  newEventCount: number;
}

export interface ImportPreview {
  events: ParsedICalEvent[];
  proposedCourses: ProposedCourse[];
  alreadyImported: number;
}

export interface CourseDecision {
  key: string;
  include: boolean;
  name: string;
  code?: string;
  color?: string;
  courseId?: string;
}

export interface ImportResult {
  createdCourses: number;
  importedEvents: number;
  skipped: number;
}

/** A saved iCal/webcal subscription — mirrors backend/db/icals.ts IcalRow. */
export interface Ical {
  id: number;
  url: string;
  /** 1 = enabled, 0 = disabled. */
  active: number;
  last_imported: string; // ISO-8601
}
