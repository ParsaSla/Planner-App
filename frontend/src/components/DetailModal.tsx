import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Store } from '../useStore';
import type { Item, ItemOccurrence } from '../types';
import {
  formatDaysList,
  formatTime,
  formatTimeHM,
  occurrenceDay,
  relativeDay,
  softColor,
} from '../util';

export interface DetailTarget {
  item: Item;
  /** The concrete occurrence that was clicked, when opened from an agenda or the calendar. */
  occurrence?: ItemOccurrence;
}

interface Props {
  store: Store;
  target: DetailTarget;
  onClose: () => void;
  onEdit: (item: Item) => void;
}

export default function DetailModal({ store, target, onClose, onEdit }: Props) {
  const { occurrence } = target;
  // Re-read the source item live so the completion state reflects store updates
  // after a toggle (the target itself is a click-time snapshot).
  const item = store.items.find((it) => it.id === target.item.id) ?? target.item;
  const isRecurring = item.recurrence === 'RECURRING';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const color = store.groupColor(item.courseId);
  const groupName = store.groupById(item.courseId)?.name;

  // Completion: one-time items carry it directly; a recurring occurrence is done
  // when its start instant is in the series' completedDates. A bare recurring
  // series (opened without an occurrence) has no single completion to toggle.
  let completed: boolean | undefined;
  let toggle: (() => void) | undefined;
  if (!isRecurring) {
    completed = item.completed ?? false;
    toggle = () => store.setCompletion(item.id, !completed);
  } else if (occurrence) {
    completed = item.completedDates?.includes(occurrence.start) ?? occurrence.completed;
    toggle = () => store.setCompletion(item.id, !completed, occurrence.start);
  }

  const when = timingLabel(item, occurrence);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal detail"
        role="dialog"
        aria-modal="true"
        style={{ '--c': color, '--cc': softColor(color) } as CSSProperties}
      >
        <div className="modal-head">
          <div className="mi detail-dot" style={{ background: color }} />
          <h3>{item.title}</h3>
          <button className="x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body detail-body">
          {toggle && (
            <button
              className={`detail-complete${completed ? ' done' : ''}`}
              aria-pressed={completed}
              onClick={toggle}
            >
              <span className="dc-box" />
              {completed ? 'Completed' : 'Mark as complete'}
            </button>
          )}

          <div className="detail-rows">
            <DetailRow icon="🕑" label="When" value={when} />
            {isRecurring && (
              <DetailRow icon="🔁" label="Repeats" value={formatDaysList(item.daysOfWeek ?? [])} />
            )}
            {groupName && (
              <DetailRow
                icon="▣"
                label="Group"
                value={<span className="pill">{groupName}</span>}
              />
            )}
            {item.location && <DetailRow icon="📍" label="Location" value={item.location} />}
            {item.description && (
              <DetailRow icon="📝" label="Notes" value={item.description} />
            )}
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={() => onEdit(item)}>
            ✎ Edit
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="detail-row">
      <span className="dr-icon">{icon}</span>
      <span className="dr-label">{label}</span>
      <span className="dr-value">{value}</span>
    </div>
  );
}

/** Human-readable timing for the detail view. */
function timingLabel(item: Item, occurrence?: ItemOccurrence): string {
  if (occurrence) {
    const start = new Date(occurrence.start);
    const day = relativeDay(occurrenceDay(occurrence.start, occurrence.allDay));
    if (occurrence.allDay) return `${day} · All day`;
    const end = new Date(occurrence.end);
    const range = isNaN(end.getTime()) ? formatTime(start) : `${formatTime(start)}–${formatTime(end)}`;
    return `${day} · ${range}`;
  }
  if (item.recurrence === 'RECURRING') {
    if (item.start_time && item.end_time) {
      return `${formatTimeHM(item.start_time.hour, item.start_time.minute)}–${formatTimeHM(
        item.end_time.hour,
        item.end_time.minute
      )}`;
    }
    return 'All day';
  }
  const start = new Date(item.start_date);
  if (item.allDay) return `${relativeDay(occurrenceDay(item.start_date, true))} · All day`;
  const end = item.end_date ? new Date(item.end_date) : undefined;
  return `${relativeDay(start)} · ${formatTime(start)}${end ? `–${formatTime(end)}` : ''}`;
}
