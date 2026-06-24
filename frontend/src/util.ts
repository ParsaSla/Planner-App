import type { PlannerItem, TaskInstance, Day, Group } from './types';
import { isEventItem, isRecurringItem } from './types';

// JS Date.getDay(): 0=Sun … 6=Sat → our Day names.
const JS_DAY_TO_NAME: Day[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

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
 * Parse a one-time task's stored date. The backend stores these as UTC midnight
 * ("YYYY-MM-DDT00:00:00.000Z"); we interpret by calendar day so the task lands
 * on the day the user picked regardless of the viewer's timezone.
 */
export function parseTaskDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(iso);
}

export function isToday(d: Date): boolean {
  return sameDay(d, new Date());
}

/**
 * Expand tasks and events into concrete dated instances within [start, end]
 * (inclusive of start day, exclusive of end day). One-time items appear once if
 * they fall in range; recurring items appear on every matching weekday. Events
 * carry a real start→end span (endDate); tasks do not.
 */
export function expandInstances(items: PlannerItem[], start: Date, end: Date): TaskInstance[] {
  const out: TaskInstance[] = [];
  const rangeStart = startOfDay(start).getTime();
  const rangeEnd = startOfDay(end).getTime();

  for (const item of items) {
    const kind = isEventItem(item) ? 'event' : 'task';

    if (isRecurringItem(item)) {
      if (!item.days?.length) continue;
      // Recurring task uses `time`; recurring event uses `startTime`/`endTime`.
      const startH = 'startTime' in item ? item.startTime : item.time;
      const endH = 'endTime' in item ? item.endTime : undefined;
      for (let cur = new Date(rangeStart); cur.getTime() < rangeEnd; cur = addDays(cur, 1)) {
        const name = JS_DAY_TO_NAME[cur.getDay()];
        if (!item.days.includes(name)) continue;
        const occ = new Date(cur);
        occ.setHours(startH?.hour ?? 0, startH?.minute ?? 0, 0, 0);
        let endDate: Date | undefined;
        if (endH) {
          endDate = new Date(cur);
          endDate.setHours(endH.hour, endH.minute, 0, 0);
        }
        const key = dayKey(occ);
        out.push({
          item,
          kind,
          date: occ,
          endDate,
          dateKey: key,
          completed: item.completedDates?.includes(key) ?? false,
          instanceDate: key,
          hasTime: true,
        });
      }
    } else if (isEventItem(item)) {
      // One-time event: real start/end datetimes.
      const d = new Date(item.start);
      if (isNaN(d.getTime())) continue;
      const t = startOfDay(d).getTime();
      if (t < rangeStart || t >= rangeEnd) continue;
      const endDate = new Date(item.end);
      out.push({
        item,
        kind,
        date: d,
        endDate: isNaN(endDate.getTime()) ? undefined : endDate,
        dateKey: dayKey(d),
        completed: item.completed,
        hasTime: true,
      });
    } else {
      // One-time task: date-only.
      const d = parseTaskDate(item.date);
      if (isNaN(d.getTime())) continue;
      const t = startOfDay(d).getTime();
      if (t < rangeStart || t >= rangeEnd) continue;
      out.push({
        item,
        kind,
        date: d,
        dateKey: dayKey(d),
        completed: item.completed,
        hasTime: false,
      });
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
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
