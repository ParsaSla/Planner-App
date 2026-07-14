import type { Day, Group } from './types';

const DAY_LABEL: Record<Day, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
};

/** Local YYYY-MM-DD key (not UTC — avoids off-by-one near midnight). */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Monday as the first day of the week. */
export function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const js = r.getDay(); // 0=Sun
  const diff = js === 0 ? -6 : 1 - js;
  return addDays(r, diff);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

/**
 * Parse a one-time item's stored date into a local Date on its own calendar day. Stored dates
 * are absolute UTC instants; `new Date` renders them in the viewer's zone, from which we take
 * the local calendar day so the item lands on the day it actually occurs for the viewer.
 */
export function parseTaskDate(iso: string): Date {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return d;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * The local Date for the calendar day an occurrence/item falls on. All-day events are zone-less
 * (stored as UTC midnight of their date), so read their UTC day; timed events are true instants
 * placed on the viewer's local day.
 */
export function occurrenceDay(iso: string, allDay?: boolean): Date {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return d;
  return allDay
    ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isToday(d: Date): boolean {
  return sameDay(d, new Date());
}

// ---- Formatting ----

export function formatTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatTimeHM(hour: number, minute: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:${String(minute).padStart(2, '0')} ${ampm}`;
}

/** "Today", "Tomorrow", "Yesterday", or a short date. */
export function relativeDay(d: Date): string {
  const today = startOfDay(new Date()).getTime();
  const that = startOfDay(d).getTime();
  const diff = Math.round((that - today) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatDaysList(days: Day[]): string {
  return days.map((d) => DAY_LABEL[d]).join(' · ');
}

export function longDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---- Group colors ----

// Fallback palette for groups without an explicit color, plus the default
// accent for tasks with no group.
const PALETTE = ['#6d8bff', '#ff7a90', '#3ecf8e', '#f0b429', '#b07cff', '#41d0d8', '#ff9d5c'];
export const NO_GROUP_COLOR = '#7d869c';

export function colorForGroup(group: Group | undefined, index = 0): string {
  if (group?.color) return group.color;
  if (!group) return NO_GROUP_COLOR;
  return PALETTE[index % PALETTE.length];
}

/** Translate a hex color to a translucent rgba for soft backgrounds. */
export function softColor(hex: string, alpha = 0.14): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
