import { useEffect, useState } from 'react';
import type { Store } from '../useStore';
import type { Selection } from '../nav';
import type { Item, ItemOccurrence } from '../types';
import {
  addDays,
  dayKey,
  formatDaysList,
  formatTime,
  formatTimeHM,
  longDate,
  occurrenceDay,
  relativeDay,
  startOfDay,
} from '../util';
import TaskRow from './TaskRow';
import type { DetailTarget } from './DetailModal';

interface Props {
  store: Store;
  selection: Selection;
  query: string;
  onOpenDetail: (target: DetailTarget) => void;
}

const isRecurring = (i: Item) => i.recurrence === 'RECURRING';
const isOneTime = (i: Item) => i.recurrence === 'ONE_TIME';

// How far back the Home "previous" section looks for uncompleted recurring
// occurrences, how far ahead "coming up" looks, and how many rows each
// collapsible section shows before its expand button.
const PAST_DAYS = 30;
const UPCOMING_DAYS = 30;
const PREVIEW = 4;

export default function TaskView({ store, selection, query, onOpenDetail }: Props) {
  const [showAllPrev, setShowAllPrev] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

  const isHome = selection.kind === 'view' && selection.view === 'home';

  // The Home page reads server-expanded occurrences for today + the upcoming
  // window; load that range whenever Home becomes active. (The calendar loads
  // its own range separately.)
  useEffect(() => {
    if (!isHome) return;
    const today = startOfDay(new Date());
    store.loadOccurrences(addDays(today, -PAST_DAYS), addDays(today, UPCOMING_DAYS + 1));
  }, [isHome, store.loadOccurrences]);

  const q = query.trim().toLowerCase();
  const matches = (t: { title: string; courseId?: string }) =>
    !q ||
    t.title.toLowerCase().includes(q) ||
    (store.groupById(t.courseId)?.name.toLowerCase().includes(q) ?? false);

  const items = store.items.filter(matches);

  const del = (item: Item) => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    store.deleteItem(item.id);
  };

  // Shared row builder for raw items.
  const itemRow = (t: Item) => {
    const color = store.groupColor(t.courseId);
    const groupName = store.groupById(t.courseId)?.name;
    if (isRecurring(t)) {
      // Recurring series show their own wall-clock time-of-day (in the item's zone), not a
      // viewer-local conversion — a 9am class reads "9:00 AM" everywhere.
      const when =
        t.start_time && t.end_time
          ? `${formatTimeHM(t.start_time.hour, t.start_time.minute)}–${formatTimeHM(
              t.end_time.hour,
              t.end_time.minute
            )}`
          : undefined;
      return (
        <TaskRow
          key={t.id}
          title={t.title}
          color={color}
          groupName={groupName}
          recurringDays={formatDaysList(t.daysOfWeek ?? [])}
          when={when}
          location={t.location}
          onEdit={() => onOpenDetail({ item: t })}
          onDelete={() => del(t)}
        />
      );
    }
    const start = new Date(t.start_date);
    const end = t.end_date ? new Date(t.end_date) : undefined;
    const when = t.allDay
      ? `${relativeDay(occurrenceDay(t.start_date, true))} · All day`
      : `${relativeDay(start)} · ${formatTime(start)}${end ? `–${formatTime(end)}` : ''}`;
    return (
      <TaskRow
        key={t.id}
        title={t.title}
        color={color}
        groupName={groupName}
        when={when}
        location={t.location}
        completed={t.completed}
        onToggle={() => store.setCompletion(t.id, !t.completed)}
        onEdit={() => onOpenDetail({ item: t })}
        onDelete={() => del(t)}
      />
    );
  };

  // Shared row builder for expanded occurrences. `withDay` prefixes the timing
  // label with the relative day (used outside the Today section).
  const occRow = (o: ItemOccurrence, key: string, withDay: boolean) => {
    const start = new Date(o.start);
    const end = new Date(o.end);
    const time = o.allDay
      ? 'All day'
      : `${formatTime(start)}${isNaN(end.getTime()) ? '' : `–${formatTime(end)}`}`;
    const when = withDay ? `${relativeDay(occurrenceDay(o.start, o.allDay))} · ${time}` : time;
    return (
      <TaskRow
        key={key}
        title={o.title}
        color={store.groupColor(o.courseId)}
        groupName={store.groupById(o.courseId)?.name}
        when={when}
        location={o.location}
        completed={o.completed}
        onToggle={() =>
          store.setCompletion(o.id, !o.completed, o.recurrence === 'RECURRING' ? o.start : undefined)
        }
        onEdit={() => {
          const src = store.items.find((it) => it.id === o.id);
          if (src) onOpenDetail({ item: src, occurrence: o });
        }}
      />
    );
  };

  const empty = (msg: string) => (
    <div className="empty">
      <div className="ico">📭</div>
      <p>{msg}</p>
      <p className="hint">Hit the ＋ button to create one.</p>
    </div>
  );

  // ---------------- HOME ----------------
  if (isHome) {
    const todayKey = dayKey(new Date());
    const todayStart = startOfDay(new Date());

    const byStart = (a: { start: string }, b: { start: string }) =>
      new Date(a.start).getTime() - new Date(b.start).getTime();

    // What's on today — expanded occurrences landing on today's calendar day.
    const today = store.occurrences
      .filter((o) => dayKey(occurrenceDay(o.start, o.allDay)) === todayKey)
      .filter((o) => matches(o))
      .sort(byStart);

    // What's coming up — occurrences after today, within the loaded window.
    const upcoming = store.occurrences
      .filter((o) => occurrenceDay(o.start, o.allDay).getTime() > todayStart.getTime())
      .filter((o) => matches(o))
      .sort(byStart);

    // Previous, not completed — a single most-recent-first list merging overdue
    // one-time items (from raw items, so age-unbounded) with past uncompleted
    // recurring occurrences (from the loaded window, back PAST_DAYS).
    const prevOneTime = items
      .filter(isOneTime)
      .filter((t) => !t.completed)
      .filter((t) => occurrenceDay(t.start_date, t.allDay).getTime() < todayStart.getTime())
      .map((t) => ({ time: new Date(t.start_date).getTime(), node: itemRow(t) }));

    const prevRecurring = store.occurrences
      .filter((o) => o.recurrence === 'RECURRING' && !o.completed)
      .filter((o) => occurrenceDay(o.start, o.allDay).getTime() < todayStart.getTime())
      .filter((o) => matches(o))
      .map((o, i) => ({ time: new Date(o.start).getTime(), node: occRow(o, `prev-${o.id}-${i}`, true) }));

    const previous = [...prevOneTime, ...prevRecurring].sort((a, b) => b.time - a.time);

    return (
      <main className="main">
        <div className="page-head">
          <h1>Home</h1>
          <span className="sub">{longDate(new Date())}</span>
        </div>
        <div style={{ height: 18 }} />

        <Section title="Today" count={today.length} empty="Nothing scheduled for today.">
          {today.map((o, i) => occRow(o, `${o.id}-${i}`, false))}
        </Section>

        <Section
          title="Overdue"
          count={previous.length}
          empty="You're all caught up."
          rows={previous.length}
          expanded={showAllPrev}
          onToggle={() => setShowAllPrev((v) => !v)}
        >
          {(showAllPrev ? previous : previous.slice(0, PREVIEW)).map((p) => p.node)}
        </Section>

        <Section
          title={`Coming up · next ${UPCOMING_DAYS} days`}
          count={upcoming.length}
          empty="Nothing coming up."
          rows={upcoming.length}
          expanded={showAllUpcoming}
          onToggle={() => setShowAllUpcoming((v) => !v)}
        >
          {(showAllUpcoming ? upcoming : upcoming.slice(0, PREVIEW)).map((o, i) =>
            occRow(o, `${o.id}-${i}`, true)
          )}
        </Section>
      </main>
    );
  }

  // ---------------- GROUP ----------------
  if (selection.kind === 'group') {
    const group = store.groupById(selection.id);
    const inGroup = items.filter((t) => t.courseId === selection.id);
    const oneTime = inGroup.filter(isOneTime).sort(byDate);
    const recurring = inGroup.filter(isRecurring);
    const total = inGroup.length;
    return (
      <main className="main">
        <div className="page-head">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 5,
                background: store.groupColor(selection.id),
              }}
            />
            {group?.name ?? 'Group'}
          </h1>
          <span className="sub">
            {group?.code ? `${group.code} · ` : ''}
            {total} items
          </span>
        </div>
        <div style={{ height: 18 }} />
        {total === 0 ? empty('Nothing in this group yet.') : [...oneTime, ...recurring].map((t) => itemRow(t))}
      </main>
    );
  }

  return null;
}

// One-time first by start date, recurring last.
function byDate(a: Item, b: Item) {
  const av = a.recurrence === 'ONE_TIME' ? new Date(a.start_date).getTime() : Number.MAX_SAFE_INTEGER;
  const bv = b.recurrence === 'ONE_TIME' ? new Date(b.start_date).getTime() : Number.MAX_SAFE_INTEGER;
  return av - bv;
}

// A collapsible Home section: header with count, its rows, and — when `rows`
// exceeds the preview length — an expand/collapse toggle.
function Section({
  title,
  count,
  empty,
  children,
  rows,
  expanded,
  onToggle,
}: {
  title: string;
  count: number;
  empty: string;
  children: JSX.Element | JSX.Element[];
  rows?: number;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const canExpand = rows !== undefined && onToggle && rows > PREVIEW;
  return (
    <div className="group-block">
      <div className="group-head">
        <h3>{title}</h3>
        <div className="bar" />
        <span className="cnt">{count}</span>
      </div>
      {count === 0 ? <div className="section-empty">{empty}</div> : children}
      {canExpand && (
        <button className="expand-btn" onClick={onToggle}>
          {expanded ? 'Show less' : `Show ${rows! - PREVIEW} more`}
        </button>
      )}
    </div>
  );
}
