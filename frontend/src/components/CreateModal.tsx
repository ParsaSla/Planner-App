import { useEffect, useState } from 'react';
import type { Store } from '../useStore';
import type { CreateKind } from './Fab';
import type { Day, Task, TaskType } from '../types';
import { DAYS, isOneTime, isRecurring } from '../types';
import { dayKey, parseTaskDate } from '../util';

interface Props {
  store: Store;
  initial: CreateKind;
  editingTask?: Task;
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

export default function CreateModal({ store, initial, editingTask, onClose }: Props) {
  const isGroup = initial === 'group';

  // ---- task form state ----
  const [taskType, setTaskType] = useState<TaskType>(
    editingTask?.type ?? (initial === 'recurring' ? 'RECURRING' : 'ONE_TIME')
  );
  const [title, setTitle] = useState(editingTask?.title ?? '');
  const [description, setDescription] = useState(editingTask?.description ?? '');
  const [groupId, setGroupId] = useState(editingTask?.course_id ?? '');
  const [date, setDate] = useState(
    editingTask && isOneTime(editingTask) ? dayKey(parseTaskDate(editingTask.date)) : dayKey(new Date())
  );
  const [days, setDays] = useState<Day[]>(
    editingTask && isRecurring(editingTask) ? editingTask.days : []
  );
  const [time, setTime] = useState(
    editingTask && isRecurring(editingTask)
      ? `${pad(editingTask.time.hour)}:${pad(editingTask.time.minute)}`
      : '09:00'
  );

  // ---- group form state ----
  const [gName, setGName] = useState('');
  const [gCode, setGCode] = useState('');
  const [gColor, setGColor] = useState(SWATCHES[0]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      } else {
        if (!title.trim()) throw new Error('Title is required.');
        const input =
          taskType === 'ONE_TIME'
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
        if (editingTask) await store.updateTask(editingTask.id, input);
        else await store.createTask(input);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  const heading = isGroup
    ? { icon: '▣', title: 'New Group', save: 'Create Group' }
    : editingTask
    ? { icon: '✎', title: 'Edit Task', save: 'Save Changes' }
    : { icon: taskType === 'RECURRING' ? '🔁' : '✓', title: 'New Task', save: 'Create Task' };

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
                  placeholder="What needs doing?"
                />
              </div>

              <div className="field">
                <label>Type</label>
                <div className="type-toggle">
                  <button
                    className={taskType === 'ONE_TIME' ? 'active' : ''}
                    onClick={() => setTaskType('ONE_TIME')}
                    type="button"
                  >
                    One-time
                  </button>
                  <button
                    className={taskType === 'RECURRING' ? 'active' : ''}
                    onClick={() => setTaskType('RECURRING')}
                    type="button"
                  >
                    Recurring
                  </button>
                </div>
              </div>

              {taskType === 'ONE_TIME' ? (
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
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : heading.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}
