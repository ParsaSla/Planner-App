import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Store } from '../useStore';
import type { ItemOccurrence } from '../types';
import type { DetailTarget } from './DetailModal';
import {
  addDays,
  dayKey,
  formatTime,
  isToday,
  longDate,
  occurrenceDay,
  softColor,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../util';

type CalView = 'day' | 'week' | 'month';

interface Props {
  store: Store;
  onClose: () => void;
  onOpenDetail: (target: DetailTarget) => void;
}

const HEAD_H = 54;
const HOUR_H = 48;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Compute the [start, end) window the current view covers.
function viewRange(view: CalView, anchor: Date): { start: Date; end: Date } {
  if (view === 'month') {
    const start = startOfWeek(startOfMonth(anchor));
    return { start, end: addDays(start, 42) };
  }
  if (view === 'week') {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 7) };
  }
  const start = startOfDay(anchor);
  return { start, end: addDays(start, 1) };
}

/** Open the detail view for an occurrence, routed back to its source item. */
function openDetail(store: Store, occ: ItemOccurrence, onOpenDetail: (target: DetailTarget) => void) {
  const src = store.items.find((it) => it.id === occ.id);
  if (src) onOpenDetail({ item: src, occurrence: occ });
}

/** Toggle completion for an occurrence (recurring occurrences carry their start instant). */
function toggleOcc(store: Store, occ: ItemOccurrence) {
  store.setCompletion(occ.id, !occ.completed, occ.recurrence === 'RECURRING' ? occ.start : undefined);
}

/** Small checkbox for a calendar event block; stops propagation so it doesn't open the editor. */
function CalCheck({ store, occ }: { store: Store; occ: ItemOccurrence }) {
  return (
    <button
      className="cal-check"
      title={occ.completed ? 'Mark as not done' : 'Mark as done'}
      aria-pressed={occ.completed}
      onClick={(e) => {
        e.stopPropagation();
        toggleOcc(store, occ);
      }}
    />
  );
}

export default function CalendarOverlay({ store, onClose, onOpenDetail }: Props) {
  const [view, setView] = useState<CalView>('week'); // week is the default
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Refetch occurrences whenever the visible window changes.
  useEffect(() => {
    const { start, end } = viewRange(view, anchor);
    store.loadOccurrences(start, end);
  }, [view, anchor, store.loadOccurrences]);

  const shift = (dir: number) => {
    if (view === 'day') setAnchor((a) => addDays(a, dir));
    else if (view === 'week') setAnchor((a) => addDays(a, dir * 7));
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));
  };

  const title = useMemo(() => {
    if (view === 'day') return longDate(anchor);
    if (view === 'month')
      return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const ws = startOfWeek(anchor);
    const we = addDays(ws, 6);
    const sameMonth = ws.getMonth() === we.getMonth();
    const left = ws.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const right = we.toLocaleDateString(undefined, {
      month: sameMonth ? undefined : 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${left} – ${right}`;
  }, [view, anchor]);

  return (
    <div className="cal-overlay">
      <div className="cal-top">
        <h2>{title}</h2>
        <div className="cal-nav">
          <button onClick={() => shift(-1)} aria-label="Previous">
            ‹
          </button>
          <button className="today" onClick={() => setAnchor(startOfDay(new Date()))}>
            Today
          </button>
          <button onClick={() => shift(1)} aria-label="Next">
            ›
          </button>
        </div>
        <div className="cal-views">
          {(['day', 'week', 'month'] as CalView[]).map((v) => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <button className="icon-btn cal-close" onClick={onClose}>
          ✕ Close
        </button>
      </div>

      {store.groups.length > 0 && (
        <div className="cal-legend">
          <span style={{ color: 'var(--text-faint)', fontWeight: 600 }}>Groups:</span>
          {store.groups.map((g) => (
            <span className="lg" key={g.id}>
              <span className="dot" style={{ background: store.groupColor(g.id) }} />
              {g.name}
            </span>
          ))}
        </div>
      )}

      <div className="cal-body">
        {view === 'month' ? (
          <MonthView store={store} anchor={anchor} onOpenDetail={onOpenDetail} />
        ) : (
          <TimeGrid store={store} anchor={anchor} view={view} onOpenDetail={onOpenDetail} />
        )}
      </div>
    </div>
  );
}

// ---------------- Month ----------------
function MonthView({
  store,
  anchor,
  onOpenDetail,
}: {
  store: Store;
  anchor: Date;
  onOpenDetail: (target: DetailTarget) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(anchor));
  const weeks = useMemo(() => {
    const byDay = new Map<string, ItemOccurrence[]>();
    for (const occ of store.occurrences) {
      const key = dayKey(occurrenceDay(occ.start, occ.allDay));
      const arr = byDay.get(key) ?? [];
      arr.push(occ);
      byDay.set(key, arr);
    }
    const ws: { date: Date; inMonth: boolean; items: ItemOccurrence[] }[][] = [];
    for (let w = 0; w < 6; w++) {
      const row = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(gridStart, w * 7 + d);
        row.push({
          date,
          inMonth: date.getMonth() === anchor.getMonth(),
          items: byDay.get(dayKey(date)) ?? [],
        });
      }
      ws.push(row);
    }
    return ws;
  }, [store.occurrences, gridStart, anchor]);

  return (
    <div className="month">
      <div className="dow">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="weeks">
        {weeks.map((row, wi) => (
          <div className="week" key={wi}>
            {row.map((cell, ci) => (
              <div
                className={`cell ${cell.inMonth ? '' : 'dim'} ${isToday(cell.date) ? 'today' : ''}`}
                key={ci}
              >
                <div className="num">{cell.date.getDate()}</div>
                {cell.items.slice(0, 3).map((occ, i) => {
                  const color = store.groupColor(occ.courseId);
                  return (
                    <div
                      key={i}
                      className={`ev${occ.completed ? ' done' : ''}`}
                      style={{ '--c': color, '--cc': softColor(color) } as CSSProperties}
                      onClick={() => openDetail(store, occ, onOpenDetail)}
                      title={occ.title}
                    >
                      {occ.allDay ? '' : `${formatTime(new Date(occ.start))} `}
                      {occ.title}
                    </div>
                  );
                })}
                {cell.items.length > 3 && <div className="ev more">+{cell.items.length - 3} more</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Week / Day (time grid) ----------------
interface LaidOut {
  occ: ItemOccurrence;
  start: Date;
  end: Date;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
}

const MIN_BLOCK = 20 * 60_000;

/** Duration of an occurrence in ms (clamped to a readable minimum). */
function occDuration(start: Date, end: Date): number {
  return Math.max(MIN_BLOCK, end.getTime() - start.getTime());
}

function layoutDay(occs: ItemOccurrence[]): LaidOut[] {
  const timed = occs
    .map((o) => ({ o, start: new Date(o.start), end: new Date(o.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: LaidOut[] = [];
  let cluster: { o: ItemOccurrence; start: Date; end: Date }[] = [];
  let clusterEnd = 0;

  const flush = () => {
    cluster.forEach((entry, i) => {
      const mins = entry.start.getHours() * 60 + entry.start.getMinutes();
      out.push({
        occ: entry.o,
        start: entry.start,
        end: entry.end,
        top: (mins / 60) * HOUR_H,
        height: (occDuration(entry.start, entry.end) / 60_000 / 60) * HOUR_H,
        leftPct: (i * 100) / cluster.length,
        widthPct: 100 / cluster.length,
      });
    });
    cluster = [];
  };

  for (const entry of timed) {
    const start = entry.start.getTime();
    if (cluster.length && start < clusterEnd) {
      cluster.push(entry);
      clusterEnd = Math.max(clusterEnd, start + occDuration(entry.start, entry.end));
    } else {
      flush();
      cluster = [entry];
      clusterEnd = start + occDuration(entry.start, entry.end);
    }
  }
  flush();
  return out;
}

function TimeGrid({
  store,
  anchor,
  view,
  onOpenDetail,
}: {
  store: Store;
  anchor: Date;
  view: 'day' | 'week';
  onOpenDetail: (target: DetailTarget) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  const cols = useMemo(() => {
    const start = view === 'week' ? startOfWeek(anchor) : startOfDay(anchor);
    const n = view === 'week' ? 7 : 1;
    return Array.from({ length: n }, (_, i) => {
      const date = addDays(start, i);
      const key = dayKey(date);
      const dayOccs = store.occurrences.filter((o) => dayKey(occurrenceDay(o.start, o.allDay)) === key);
      const allDay = dayOccs.filter((o) => o.allDay);
      const timed = layoutDay(dayOccs.filter((o) => !o.allDay));
      return { date, timed, allDay };
    });
  }, [store.occurrences, anchor, view]);

  // Scroll the work-day into view on mount / when the period changes.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = HEAD_H + 7 * HOUR_H - 40;
  }, [anchor, view]);

  const labelFor = (h: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr} ${ampm}`;
  };

  return (
    <div className="cal-body" ref={bodyRef} style={{ overflow: 'auto', height: '100%' }}>
      <div className="tg" style={{ gridTemplateColumns: '60px 1fr' }}>
        <div className="tg-times">
          <div style={{ height: HEAD_H }} />
          {HOURS.map((h) => (
            <div className="th" style={{ height: HOUR_H }} key={h}>
              {h === 0 ? '' : labelFor(h)}
            </div>
          ))}
        </div>

        <div className="tg-cols" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
          {cols.map((col, ci) => (
            <div className="tg-col" key={ci}>
              <div className={`tg-head ${isToday(col.date) ? 'today' : ''}`} style={{ height: HEAD_H }}>
                <div className="d">
                  {col.date.toLocaleDateString(undefined, { weekday: 'short' })}
                </div>
                <div className="n">{col.date.getDate()}</div>
              </div>

              {col.allDay.length > 0 && (
                <div className="tg-allday">
                  {col.allDay.map((occ, i) => {
                    const color = store.groupColor(occ.courseId);
                    return (
                      <div
                        key={i}
                        className={`tg-ev allday${occ.completed ? ' done' : ''}`}
                        style={{ '--c': color, '--cc': softColor(color) } as CSSProperties}
                        onClick={() => openDetail(store, occ, onOpenDetail)}
                        title={occ.title}
                      >
                        <CalCheck store={store} occ={occ} />
                        <div className="et">{occ.title}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ position: 'relative' }}>
                {HOURS.map((h) => (
                  <div className="hr" style={{ height: HOUR_H }} key={h} />
                ))}
                {col.timed.map((lo, i) => {
                  const color = store.groupColor(lo.occ.courseId);
                  return (
                    <div
                      key={i}
                      className={`tg-ev${lo.occ.completed ? ' done' : ''}`}
                      style={
                        {
                          top: lo.top,
                          height: lo.height,
                          left: `calc(${lo.leftPct}% + 2px)`,
                          width: `calc(${lo.widthPct}% - 4px)`,
                          '--c': color,
                          '--cc': softColor(color),
                        } as CSSProperties
                      }
                      onClick={() => openDetail(store, lo.occ, onOpenDetail)}
                      title={lo.occ.title}
                    >
                      <CalCheck store={store} occ={lo.occ} />
                      <div className="et">{lo.occ.title}</div>
                      <div className="es">
                        {formatTime(lo.start)} – {formatTime(lo.end)}
                        {lo.occ.recurrence === 'RECURRING' ? ' · 🔁' : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
