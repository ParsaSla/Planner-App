import { useEffect, useState } from 'react';
import type { Store } from '../useStore';
import type { CreateKind } from './Fab';
import type { Day, PlannerItem, TaskType, EventInput, TaskInput } from '../types';
import { DAYS, isOneTime, isRecurring, isEventItem, isOneTimeEvent, isRecurringItem } from '../types';
import { dayKey, parseTaskDate } from '../util';

interface Props {
  store: Store;
  initial: CreateKind;
  editingItem?: PlannerItem;
  onClose: () => void;
}

const DAY_LETTER: Record<Day, string> = {
  MONDAY: 'M',
  TUESDAY: 'T',
  WEDNESDAY: 'W',
  THURSDAY: 'T',
  FRIDAY: 'F',
  SATURDAY: 'S',
  SUNDAY: 'S',
};

const SWATCHES = ['#6d8bff', '#ff7a90', '#3ecf8e', '#f0b429', '#b07cff', '#41d0d8', '#ff9d5c'];

export default function CreateModal({ store, initial, editingItem, onClose }: Props) {
  const isGroup = initial === 'group';
  // Event mode: explicit event create kinds, or editing an existing event.
  const isEvent =
    !isGroup &&
    (initial === 'event' ||
      initial === 'recurring-event' ||
      (!!editingItem && isEventItem(editingItem)));

  const initialType: TaskType = editingItem
    ? editingItem.type
    : initial === 'recurring' || initial === 'recurring-event'
    ? 'RECURRING'
    : 'ONE_TIME';

  // ---- shared form state ----
  const [type, setType] = useState<TaskType>(initialType);
  const [title, setTitle] = useState(editingItem?.title ?? '');
  const [description, setDescription] = useState(editingItem?.description ?? '');
  const [groupId, setGroupId] = useState(editingItem?.course_id ?? '');

  // Recurrence days — shared by recurring tasks and recurring events.
  const [days, setDays] = useState<Day[]>(
    editingItem && isRecurringItem(editingItem) ? editingItem.days : []
  );

  // ---- one-time task ----
  const [date, setDate] = useState(
    editingItem && !isEventItem(editingItem) && isOneTime(editingItem)
      ? dayKey(parseTaskDate(editingItem.date))
      : dayKey(new Date())
  );

  // ---- recurring task ----
  const [time, setTime] = useState(
    editingItem && !isEventItem(editingItem) && isRecurring(editingItem)
      ? `${pad(editingItem.time.hour)}:${pad(editingItem.time.minute)}`
      : '09:00'
  );

  // ---- one-time event ----
  const editingOneTimeEvent =
    editingItem && isEventItem(editingItem) && isOneTimeEvent(editingItem) ? editingItem : undefined;
  const [startAt, setStartAt] = useState(
    editingOneTimeEvent ? toLocalInput(new Date(editingOneTimeEvent.start)) : defaultAt(9)
  );
  const [endAt, setEndAt] = useState(
    editingOneTimeEvent ? toLocalInput(new Date(editingOneTimeEvent.end)) : defaultAt(10)
  );

  // ---- recurring event ----
  const editingRecEvent =
    editingItem && isEventItem(editingItem) && !isOneTimeEvent(editingItem) ? editingItem : undefined;
  const [startTime, setStartTime] = useState(
    editingRecEvent ? `${pad(editingRecEvent.startTime.hour)}:${pad(editingRecEvent.startTime.minute)}` : '09:00'
  );
  const [endTime, setEndTime] = useState(
    editingRecEvent ? `${pad(editingRecEvent.endTime.hour)}:${pad(editingRecEvent.endTime.minute)}` : '10:00'
  );

  // ---- group form state ----
  const [gName, setGName] = useState('');
  const [gCode, setGCode] = useState('');
  const [gColor, setGColor] = useState(SWATCHES[0]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleDay = (d: Day) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  async function save() {
    setError(null);
    try {
      setSaving(true);
      if (isGroup) {
        if (!gName.trim()) throw new Error('Group name is required.');
        await store.createGroup({ name: gName.trim(), code: gCode.trim() || undefined, color: gColor });
      } else if (isEvent) {
        if (!title.trim()) throw new Error('Title is required.');
        const input: EventInput =
          type === 'ONE_TIME'
            ? (() => {
                if (!startAt || !endAt) throw new Error('Start and end are required.');
                if (new Date(endAt).getTime() <= new Date(startAt).getTime())
                  throw new Error('End must be after start.');
                return {
                  type: 'ONE_TIME' as const,
                  title: title.trim(),
                  description: description.trim() || undefined,
                  start: startAt,
                  end: endAt,
                  courseId: groupId || undefined,
                };
              })()
            : (() => {
                if (days.length === 0) throw new Error('Pick at least one day.');
                const [sh, sm] = startTime.split(':').map(Number);
                const [eh, em] = endTime.split(':').map(Number);
                if (eh * 60 + em <= sh * 60 + sm) throw new Error('End must be after start.');
                return {
                  type: 'RECURRING' as const,
                  title: title.trim(),
                  description: description.trim() || undefined,
                  days,
                  startTime: { hour: sh, minute: sm },
                  endTime: { hour: eh, minute: em },
                  courseId: groupId || undefined,
                };
              })();
        if (editingItem) await store.updateEvent(editingItem.id, input);
        else await store.createEvent(input);
      } else {
        if (!title.trim()) throw new Error('Title is required.');
        const input: TaskInput =
          type === 'ONE_TIME'
            ? {
                type: 'ONE_TIME' as const,
                title: title.trim(),
                description: description.trim() || undefined,
                date,
                courseId: groupId || undefined,
              }
            : (() => {
                if (days.length === 0) throw new Error('Pick at least one day.');
                const [h, m] = time.split(':').map(Number);
                return {
                  type: 'RECURRING' as const,
                  title: title.trim(),
                  description: description.trim() || undefined,
                  days,
                  time: { hour: h, minute: m },
                  courseId: groupId || undefined,
                };
              })();
        if (editingItem) await store.updateTask(editingItem.id, input);
        else await store.createTask(input);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  async function del() {
    if (!editingItem) return;
    setError(null);
    try {
      setDeleting(true);
      if (isEventItem(editingItem)) await store.deleteEvent(editingItem.id);
      else await store.deleteTask(editingItem.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete it.');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const noun = isEvent ? 'Event' : 'Task';
  const heading = isGroup
    ? { icon: '▣', title: 'New Group', save: 'Create Group' }
    : editingItem
    ? { icon: '✎', title: `Edit ${noun}`, save: 'Save Changes' }
    : {
        icon: isEvent ? (type === 'RECURRING' ? '🗓️' : '📅') : type === 'RECURRING' ? '🔁' : '✓',
        title: `New ${noun}`,
        save: `Create ${noun}`,
      };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="mi">{heading.icon}</div>
          <h3>{heading.title}</h3>
          <button className="x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {isGroup ? (
            <>
              <div className="field">
                <label>Group name</label>
                <input
                  autoFocus
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                  placeholder="e.g. Physics"
                  maxLength={100}
                />
              </div>
              <div className="field">
                <label>Code (optional)</label>
                <input
                  value={gCode}
                  onChange={(e) => setGCode(e.target.value)}
                  placeholder="PHYS101"
                  maxLength={20}
                />
              </div>
              <div className="field">
                <label>Colour</label>
                <div className="swatches">
                  {SWATCHES.map((c) => (
                    <div
                      key={c}
                      className={`sw ${gColor === c ? 'active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setGColor(c)}
                    />
                  ))}
                  <label className="sw custom" title="Custom colour" style={{ background: gColor }}>
                    <input type="color" value={gColor} onChange={(e) => setGColor(e.target.value)} />
                  </label>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label>Title</label>
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isEvent ? 'What’s happening?' : 'What needs doing?'}
                />
              </div>

              <div className="field">
                <label>Type</label>
                <div className="type-toggle">
                  <button
                    className={type === 'ONE_TIME' ? 'active' : ''}
                    onClick={() => setType('ONE_TIME')}
                    type="button"
                  >
                    One-time
                  </button>
                  <button
                    className={type === 'RECURRING' ? 'active' : ''}
                    onClick={() => setType('RECURRING')}
                    type="button"
                  >
                    Recurring
                  </button>
                </div>
              </div>

              {/* Scheduling fields differ by task vs event and recurrence. */}
              {isEvent ? (
                type === 'ONE_TIME' ? (
                  <div className="row">
                    <div className="field">
                      <label>Starts</label>
                      <input
                        type="datetime-local"
                        value={startAt}
                        onChange={(e) => setStartAt(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Ends</label>
                      <input
                        type="datetime-local"
                        value={endAt}
                        onChange={(e) => setEndAt(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="field">
                      <label>Days</label>
                      <div className="type-toggle day-toggle">
                        {DAYS.map((d) => (
                          <button
                            key={d}
                            type="button"
                            className={days.includes(d) ? 'active' : ''}
                            onClick={() => toggleDay(d)}
                            title={d}
                          >
                            {DAY_LETTER[d]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="row">
                      <div className="field">
                        <label>Starts</label>
                        <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Ends</label>
                        <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                      </div>
                    </div>
                  </>
                )
              ) : type === 'ONE_TIME' ? (
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              ) : (
                <>
                  <div className="field">
                    <label>Days</label>
                    <div className="type-toggle day-toggle">
                      {DAYS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          className={days.includes(d) ? 'active' : ''}
                          onClick={() => toggleDay(d)}
                          title={d}
                        >
                          {DAY_LETTER[d]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label>Time</label>
                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </div>
                </>
              )}

              <div className="field">
                <label>Group</label>
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">— No group —</option>
                  {store.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add details…"
                />
              </div>
            </>
          )}

          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-foot">
          {editingItem && !isGroup && (
            <button
              className="btn danger del"
              onClick={() => setConfirmingDelete(true)}
              disabled={saving || deleting}
            >
              Delete
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : heading.save}
          </button>
        </div>
      </div>

      {confirmingDelete && editingItem && (
        <div
          className="scrim confirm-scrim"
          onMouseDown={(e) => e.target === e.currentTarget && !deleting && setConfirmingDelete(false)}
        >
          <div className="modal confirm" role="alertdialog" aria-modal="true">
            <div className="modal-body">
              <h3 className="confirm-title">Delete this {noun.toLowerCase()}?</h3>
              <p className="confirm-text">
                “{editingItem.title}” will be permanently removed. This can’t be undone.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                Cancel
              </button>
              <button className="btn danger" onClick={del} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Format a Date as a `datetime-local` input value in local time. */
function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

/** Today at the given hour, as a `datetime-local` value. */
function defaultAt(hour: number) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return toLocalInput(d);
}
