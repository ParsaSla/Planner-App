import { useEffect, useState } from 'react';
import type { Store } from '../useStore';
import type { Selection } from '../nav';
import type { Item } from '../types';
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

interface Props {
  store: Store;
  selection: Selection;
  query: string;
  onEdit: (item: Item) => void;
}

type AllMode = 'grouped' | 'list' | 'date';

const isRecurring = (i: Item) => i.recurrence === 'RECURRING';
const isOneTime = (i: Item) => i.recurrence === 'ONE_TIME';

export default function TaskView({ store, selection, query, onEdit }: Props) {
  const [allMode, setAllMode] = useState<AllMode>('grouped');

  const isToday = selection.kind === 'view' && selection.view === 'today';

  // The Today agenda reads server-expanded occurrences; load its window whenever
  // the Today view becomes active. (The calendar loads its own range separately.)
  useEffect(() => {
    if (!isToday) return;
    const today = startOfDay(new Date());
    store.loadOccurrences(today, addDays(today, 1));
  }, [isToday, store.loadOccurrences]);

  const q = query.trim().toLowerCase();
  const matches = (t: { title: string; courseId?: string }) =>
    !q ||
    t.title.toLowerCase().includes(q) ||
    (store.groupById(t.courseId)?.name.toLowerCase().includes(q) ?? false);

  const items = store.items.filter(matches);

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
          onEdit={() => onEdit(t)}
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
        onEdit={() => onEdit(t)}
        onDelete={() => del(t)}
      />
    );
  };

  const del = (item: Item) => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    store.deleteItem(item.id);
  };

  const empty = (msg: string) => (
    <div className="empty">
      <div className="ico">📭</div>
      <p>{msg}</p>
      <p className="hint">Hit the ＋ button to create one.</p>
    </div>
  );

  // ---------------- TODAY ----------------
  if (isToday) {
    const todayKey = dayKey(new Date());
    const occ = store.occurrences
      .filter((o) => dayKey(occurrenceDay(o.start, o.allDay)) === todayKey)
      .filter((o) => matches(o));
    return (
      <main className="main">
        <div className="page-head">
          <h1>Today</h1>
          <span className="sub">
            {longDate(new Date())} · {occ.length} scheduled
          </span>
        </div>
        {occ.length === 0
          ? empty('Nothing scheduled for today.')
          : occ.map((o, i) => {
              const start = new Date(o.start);
              const end = new Date(o.end);
              const when = o.allDay
                ? 'All day'
                : `${formatTime(start)}${isNaN(end.getTime()) ? '' : `–${formatTime(end)}`}`;
              return (
                <TaskRow
                  key={`${o.id}-${i}`}
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
                    if (src) onEdit(src);
                  }}
                />
              );
            })}
      </main>
    );
  }

  // ---------------- RECURRING ----------------
  if (selection.kind === 'view' && selection.view === 'recurring') {
    const recurring = items.filter(isRecurring);
    return (
      <main className="main">
        <div className="page-head">
          <h1>Recurring</h1>
          <span className="sub">{recurring.length} repeating items</span>
        </div>
        <div style={{ height: 18 }} />
        {recurring.length === 0 ? empty('No recurring items yet.') : recurring.map((t) => itemRow(t))}
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

  // ---------------- ALL ----------------
  return (
    <main className="main">
      <div className="page-head">
        <h1>All Items</h1>
        <span className="sub">
          {longDate(new Date())} · {items.length} items
        </span>
      </div>
      <div className="seg">
        {(['grouped', 'list', 'date'] as AllMode[]).map((m) => (
          <button key={m} className={allMode === m ? 'active' : ''} onClick={() => setAllMode(m)}>
            {m === 'grouped' ? 'Grouped' : m === 'list' ? 'List' : 'By date'}
          </button>
        ))}
      </div>

      {items.length === 0 && empty('No items yet.')}

      {allMode === 'grouped' && <Grouped store={store} items={items} itemRow={itemRow} />}
      {allMode === 'list' && [...items].sort(byDate).map((t) => itemRow(t))}
      {allMode === 'date' && <ByDate items={items} itemRow={itemRow} />}
    </main>
  );
}

// One-time first by start date, recurring last.
function byDate(a: Item, b: Item) {
  const av = a.recurrence === 'ONE_TIME' ? new Date(a.start_date).getTime() : Number.MAX_SAFE_INTEGER;
  const bv = b.recurrence === 'ONE_TIME' ? new Date(b.start_date).getTime() : Number.MAX_SAFE_INTEGER;
  return av - bv;
}

function Grouped({
  store,
  items,
  itemRow,
}: {
  store: Store;
  items: Item[];
  itemRow: (t: Item) => JSX.Element;
}) {
  // Order: defined groups (in sidebar order), then "No group".
  const blocks: { id?: string; name: string; code?: string; color: string; items: Item[] }[] = [];
  for (const g of store.groups) {
    const inGroup = items.filter((t) => t.courseId === g.id).sort(byDate);
    if (inGroup.length)
      blocks.push({ id: g.id, name: g.name, code: g.code, color: store.groupColor(g.id), items: inGroup });
  }
  const ungrouped = items.filter((t) => !t.courseId || !store.groupById(t.courseId)).sort(byDate);
  if (ungrouped.length)
    blocks.push({ name: 'No group', color: store.groupColor(undefined), items: ungrouped });

  return (
    <>
      {blocks.map((b) => (
        <div className="group-block" key={b.id ?? 'none'}>
          <div className="group-head">
            <span className="dot" style={{ background: b.color }} />
            <h3>{b.name}</h3>
            {b.code && <span className="meta">{b.code}</span>}
            <div className="bar" />
            <span className="cnt">{b.items.length}</span>
          </div>
          {b.items.map((t) => itemRow(t))}
        </div>
      ))}
    </>
  );
}

function ByDate({ items, itemRow }: { items: Item[]; itemRow: (t: Item) => JSX.Element }) {
  const todayK = dayKey(new Date());
  const weekEnd = addDays(startOfDay(new Date()), 7).getTime();

  const buckets: { name: string; items: Item[] }[] = [
    { name: 'Overdue', items: [] },
    { name: 'Today', items: [] },
    { name: 'This week', items: [] },
    { name: 'Later', items: [] },
    { name: 'Recurring', items: [] },
  ];
  for (const t of items) {
    if (isRecurring(t)) {
      buckets[4].items.push(t);
      continue;
    }
    const d = occurrenceDay(t.start_date, t.allDay);
    const k = dayKey(d);
    if (k === todayK) buckets[1].items.push(t);
    else if (d.getTime() < startOfDay(new Date()).getTime()) buckets[0].items.push(t);
    else if (d.getTime() < weekEnd) buckets[2].items.push(t);
    else buckets[3].items.push(t);
  }
  buckets.forEach((b) => b.items.sort(byDate));

  return (
    <>
      {buckets
        .filter((b) => b.items.length)
        .map((b) => (
          <div className="group-block" key={b.name}>
            <div className="group-head">
              <h3>{b.name}</h3>
              <div className="bar" />
              <span className="cnt">{b.items.length}</span>
            </div>
            {b.items.map((t) => itemRow(t))}
          </div>
        ))}
    </>
  );
}
