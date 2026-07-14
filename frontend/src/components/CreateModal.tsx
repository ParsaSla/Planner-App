import { useEffect, useState } from 'react';
import type { Store } from '../useStore';
import type { CreateKind } from './Fab';
import type { Day, Group, Item, ItemInput, Recurrence } from '../types';
import { DAYS } from '../types';
import { dayKey, parseTaskDate } from '../util';

interface Props {
  store: Store;
  initial: CreateKind;
  editingItem?: Item;
  editingGroup?: Group;
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

export default function CreateModal({ store, initial, editingItem, editingGroup, onClose }: Props) {
  const isGroup = initial === 'group';

  const initialRecurrence: Recurrence = editingItem?.recurrence ?? 'ONE_TIME';

  // ---- shared item form state ----
  const [recurrence, setRecurrence] = useState<Recurrence>(initialRecurrence);
  const [title, setTitle] = useState(editingItem?.title ?? '');
  const [description, setDescription] = useState(editingItem?.description ?? '');
  const [location, setLocation] = useState(editingItem?.location ?? '');
  const [groupId, setGroupId] = useState(editingItem?.courseId ?? '');

  // Recurrence weekdays.
  const [days, setDays] = useState<Day[]>(editingItem?.daysOfWeek ?? []);

  // ---- one-time span (datetime-local) ----
  const editingOneTime = editingItem?.recurrence === 'ONE_TIME' ? editingItem : undefined;
  const [startAt, setStartAt] = useState(
    editingOneTime ? toLocalInput(new Date(editingOneTime.start_date)) : defaultAt(9)
  );
  const [endAt, setEndAt] = useState(
    editingOneTime && editingOneTime.end_date
      ? toLocalInput(new Date(editingOneTime.end_date))
      : defaultAt(10)
  );

  // ---- recurring series ----
  const editingRecurring = editingItem?.recurrence === 'RECURRING' ? editingItem : undefined;
  const [startTime, setStartTime] = useState(
    editingRecurring?.start_time
      ? `${pad(editingRecurring.start_time.hour)}:${pad(editingRecurring.start_time.minute)}`
      : '09:00'
  );
  const [endTime, setEndTime] = useState(
    editingRecurring?.end_time
      ? `${pad(editingRecurring.end_time.hour)}:${pad(editingRecurring.end_time.minute)}`
      : '10:00'
  );
  // Series anchor (required) and optional UNTIL bound, as YYYY-MM-DD.
  const [seriesStart, setSeriesStart] = useState(
    editingRecurring ? dayKey(parseTaskDate(editingRecurring.start_date)) : dayKey(new Date())
  );
  const [seriesEnd, setSeriesEnd] = useState(
    editingRecurring?.end_date ? dayKey(parseTaskDate(editingRecurring.end_date)) : ''
  );

  // ---- group form state ----
  const [gName, setGName] = useState(editingGroup?.name ?? '');
  const [gCode, setGCode] = useState(editingGroup?.code ?? '');
  const [gColor, setGColor] = useState(editingGroup?.color ?? SWATCHES[0]);

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
        const groupInput = { name: gName.trim(), code: gCode.trim() || undefined, color: gColor };
        if (editingGroup) await store.updateGroup(editingGroup.id, groupInput);
        else await store.createGroup(groupInput);
      } else {
        if (!title.trim()) throw new Error('Title is required.');
        let input: ItemInput;
        if (recurrence === 'ONE_TIME') {
          if (!startAt || !endAt) throw new Error('Start and end are required.');
          if (new Date(endAt).getTime() <= new Date(startAt).getTime())
            throw new Error('End must be after start.');
          input = {
            recurrence: 'ONE_TIME',
            title: title.trim(),
            description: description.trim() || undefined,
            location: location.trim() || undefined,
            // Resolve the naked datetime-local against the browser's zone into an absolute
            // instant, and record that zone so it renders consistently everywhere.
            start_date: new Date(startAt).toISOString(),
            end_date: new Date(endAt).toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            courseId: groupId || undefined,
          };
        } else {
          if (days.length === 0) throw new Error('Pick at least one day.');
          if (!seriesStart) throw new Error('A start date is required.');
          const [sh, sm] = startTime.split(':').map(Number);
          const [eh, em] = endTime.split(':').map(Number);
          if (eh * 60 + em <= sh * 60 + sm) throw new Error('End time must be after start time.');
          if (seriesEnd && new Date(seriesEnd).getTime() < new Date(seriesStart).getTime())
            throw new Error('End date must be on or after the start date.');
          input = {
            recurrence: 'RECURRING',
            title: title.trim(),
            description: description.trim() || undefined,
            location: location.trim() || undefined,
            daysOfWeek: days,
            start_time: { hour: sh, minute: sm },
            end_time: { hour: eh, minute: em },
            start_date: seriesStart,
            end_date: seriesEnd || undefined,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            courseId: groupId || undefined,
          };
        }
        if (editingItem) await store.updateItem(editingItem.id, input);
        else await store.createItem(input);
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
      await store.deleteItem(editingItem.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete it.');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const heading = isGroup
    ? editingGroup
      ? { icon: '▣', title: 'Edit Group', save: 'Save Changes' }
      : { icon: '▣', title: 'New Group', save: 'Create Group' }
    : editingItem
    ? { icon: '✎', title: 'Edit Item', save: 'Save Changes' }
    : {
        icon: recurrence === 'RECURRING' ? '🔁' : '📅',
        title: 'New Item',
        save: 'Create Item',
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
                  placeholder="What’s happening?"
                />
              </div>

              <div className="field">
                <label>Recurrence</label>
                <div className="type-toggle">
                  <button
                    className={recurrence === 'ONE_TIME' ? 'active' : ''}
                    onClick={() => setRecurrence('ONE_TIME')}
                    type="button"
                  >
                    One-time
                  </button>
                  <button
                    className={recurrence === 'RECURRING' ? 'active' : ''}
                    onClick={() => setRecurrence('RECURRING')}
                    type="button"
                  >
                    Recurring
                  </button>
                </div>
              </div>

              {/* Scheduling fields differ by recurrence. */}
              {recurrence === 'ONE_TIME' ? (
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
                  <div className="row">
                    <div className="field">
                      <label>Start date</label>
                      <input
                        type="date"
                        value={seriesStart}
                        onChange={(e) => setSeriesStart(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>End date (optional)</label>
                      <input
                        type="date"
                        value={seriesEnd}
                        onChange={(e) => setSeriesEnd(e.target.value)}
                      />
                    </div>
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
                <label>Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Room 214"
                />
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
              <h3 className="confirm-title">Delete this item?</h3>
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
