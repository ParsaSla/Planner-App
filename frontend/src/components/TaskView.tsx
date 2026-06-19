import { useState } from 'react';
import type { Store } from '../useStore';
import type { Selection } from '../nav';
import type { Task } from '../types';
import { isOneTime, isRecurring } from '../types';
import {
  addDays,
  dayKey,
  expandInstances,
  formatDaysList,
  formatTime,
  formatTimeHM,
  longDate,
  parseTaskDate,
  relativeDay,
  startOfDay,
} from '../util';
import TaskRow from './TaskRow';

interface Props {
  store: Store;
  selection: Selection;
  query: string;
  onEdit: (task: Task) => void;
  onCreate: () => void;
}

type AllMode = 'grouped' | 'list' | 'date';

export default function TaskView({ store, selection, query, onEdit, onCreate }: Props) {
  const [allMode, setAllMode] = useState<AllMode>('grouped');

  const q = query.trim().toLowerCase();
  const matches = (t: Task) =>
    !q ||
    t.title.toLowerCase().includes(q) ||
    (store.groupById(t.course_id)?.name.toLowerCase().includes(q) ?? false);

  const tasks = store.tasks.filter(matches);

  // Shared row builder for task-centric rows.
  const taskRow = (t: Task, opts: { toggle?: boolean } = {}) => {
    const color = store.groupColor(t.course_id);
    const groupName = store.groupById(t.course_id)?.name;
    if (isRecurring(t)) {
      return (
        <TaskRow
          key={t.id}
          title={t.title}
          color={color}
          groupName={groupName}
          recurringDays={formatDaysList(t.days)}
          when={formatTimeHM(t.time.hour, t.time.minute)}
          done={false}
          onEdit={() => onEdit(t)}
          onDelete={() => del(t)}
        />
      );
    }
    return (
      <TaskRow
        key={t.id}
        title={t.title}
        color={color}
        groupName={groupName}
        when={relativeDay(parseTaskDate(t.date))}
        done={t.completed}
        onToggle={opts.toggle === false ? undefined : () => store.toggleOneTime(t.id, !t.completed)}
        onEdit={() => onEdit(t)}
        onDelete={() => del(t)}
      />
    );
  };

  const del = (t: Task) => {
    if (confirm(`Delete "${t.title}"?`)) store.deleteTask(t.id);
  };

  const empty = (msg: string) => (
    <div className="empty">
      <div className="ico">📭</div>
      <p>{msg}</p>
      <p className="hint">Hit the ＋ button to create one.</p>
    </div>
  );

  // ---------------- TODAY ----------------
  if (selection.kind === 'view' && selection.view === 'today') {
    const today = startOfDay(new Date());
    const instances = expandInstances(tasks, today, addDays(today, 1));
    const open = instances.filter((i) => !i.completed).length;
    return (
      <main className="main">
        <div className="page-head">
          <h1>Today</h1>
          <span className="sub">
            {longDate(new Date())} · {open} open
          </span>
        </div>
        <div style={{ height: 18 }} />
        {instances.length === 0
          ? empty('Nothing scheduled for today.')
          : instances.map((inst, i) => {
              const t = inst.task;
              const color = store.groupColor(t.course_id);
              return (
                <TaskRow
                  key={`${t.id}-${i}`}
                  title={t.title}
                  color={color}
                  groupName={store.groupById(t.course_id)?.name}
                  recurringDays={isRecurring(t) ? formatDaysList(t.days) : undefined}
                  when={inst.hasTime ? formatTime(inst.date) : undefined}
                  done={inst.completed}
                  onToggle={() =>
                    inst.instanceDate
                      ? store.toggleInstance(t.id, inst.instanceDate, !inst.completed)
                      : store.toggleOneTime(t.id, !inst.completed)
                  }
                  onEdit={() => onEdit(t)}
                  onDelete={() => del(t)}
                />
              );
            })}
      </main>
    );
  }

  // ---------------- RECURRING ----------------
  if (selection.kind === 'view' && selection.view === 'recurring') {
    const recurring = tasks.filter(isRecurring);
    return (
      <main className="main">
        <div className="page-head">
          <h1>Recurring</h1>
          <span className="sub">{recurring.length} repeating tasks</span>
        </div>
        <div style={{ height: 18 }} />
        {recurring.length === 0 ? empty('No recurring tasks yet.') : recurring.map((t) => taskRow(t))}
      </main>
    );
  }

  // ---------------- COMPLETED ----------------
  if (selection.kind === 'view' && selection.view === 'completed') {
    const done = tasks.filter((t) => isOneTime(t) && t.completed);
    return (
      <main className="main">
        <div className="page-head">
          <h1>Completed</h1>
          <span className="sub">{done.length} done</span>
        </div>
        <div style={{ height: 18 }} />
        {done.length === 0 ? empty('No completed tasks yet.') : done.map((t) => taskRow(t))}
      </main>
    );
  }

  // ---------------- GROUP ----------------
  if (selection.kind === 'group') {
    const group = store.groupById(selection.id);
    const inGroup = tasks.filter((t) => t.course_id === selection.id);
    const oneTime = inGroup.filter(isOneTime).sort(byDate);
    const recurring = inGroup.filter(isRecurring);
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
            {inGroup.length} tasks
          </span>
        </div>
        <div style={{ height: 18 }} />
        {inGroup.length === 0
          ? empty('No tasks in this group yet.')
          : [...oneTime, ...recurring].map((t) => taskRow(t))}
      </main>
    );
  }

  // ---------------- ALL ----------------
  const open = tasks.filter((t) => !(isOneTime(t) && t.completed));
  return (
    <main className="main">
      <div className="page-head">
        <h1>All Tasks</h1>
        <span className="sub">
          {longDate(new Date())} · {open.length} open
        </span>
      </div>
      <div className="seg">
        {(['grouped', 'list', 'date'] as AllMode[]).map((m) => (
          <button key={m} className={allMode === m ? 'active' : ''} onClick={() => setAllMode(m)}>
            {m === 'grouped' ? 'Grouped' : m === 'list' ? 'List' : 'By date'}
          </button>
        ))}
      </div>

      {open.length === 0 && empty('No open tasks. Nice work!')}

      {allMode === 'grouped' && <Grouped store={store} tasks={open} taskRow={taskRow} onCreate={onCreate} />}
      {allMode === 'list' && [...open].sort(byDate).map((t) => taskRow(t))}
      {allMode === 'date' && <ByDate tasks={open} taskRow={taskRow} />}
    </main>
  );
}

// One-time first by date, recurring last.
function byDate(a: Task, b: Task) {
  const av = isOneTime(a) ? parseTaskDate(a.date).getTime() : Number.MAX_SAFE_INTEGER;
  const bv = isOneTime(b) ? parseTaskDate(b.date).getTime() : Number.MAX_SAFE_INTEGER;
  return av - bv;
}

function Grouped({
  store,
  tasks,
  taskRow,
}: {
  store: Store;
  tasks: Task[];
  taskRow: (t: Task) => JSX.Element;
  onCreate: () => void;
}) {
  // Order: defined groups (in sidebar order), then "No group".
  const blocks: { id?: string; name: string; code?: string; color: string; items: Task[] }[] = [];
  for (const g of store.groups) {
    const items = tasks.filter((t) => t.course_id === g.id).sort(byDate);
    if (items.length) blocks.push({ id: g.id, name: g.name, code: g.code, color: store.groupColor(g.id), items });
  }
  const ungrouped = tasks.filter((t) => !t.course_id || !store.groupById(t.course_id)).sort(byDate);
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
          {b.items.map((t) => taskRow(t))}
        </div>
      ))}
    </>
  );
}

function ByDate({ tasks, taskRow }: { tasks: Task[]; taskRow: (t: Task) => JSX.Element }) {
  const todayK = dayKey(new Date());
  const weekEnd = addDays(startOfDay(new Date()), 7).getTime();

  const buckets: { name: string; items: Task[] }[] = [
    { name: 'Overdue', items: [] },
    { name: 'Today', items: [] },
    { name: 'This week', items: [] },
    { name: 'Later', items: [] },
    { name: 'Recurring', items: [] },
  ];
  for (const t of tasks) {
    if (isRecurring(t)) {
      buckets[4].items.push(t);
      continue;
    }
    const d = startOfDay(parseTaskDate(t.date));
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
            {b.items.map((t) => taskRow(t))}
          </div>
        ))}
    </>
  );
}
