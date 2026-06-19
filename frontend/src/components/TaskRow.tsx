import type { CSSProperties } from 'react';
import { softColor } from '../util';

interface Props {
  title: string;
  color: string;
  groupName?: string;
  /** Right-aligned timing label, e.g. "Today · 5:00 PM". */
  when?: string;
  /** Schedule label for recurring tasks, e.g. "Mon · Wed · Fri". */
  recurringDays?: string;
  done: boolean;
  /** If provided, a completion checkbox is shown. */
  onToggle?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function TaskRow({
  title,
  color,
  groupName,
  when,
  recurringDays,
  done,
  onToggle,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div
      className={`task ${done ? 'done' : ''}`}
      style={{ '--c': color, '--cc': softColor(color) } as CSSProperties}
      onClick={onEdit}
    >
      {onToggle ? (
        <button
          className="check"
          aria-label={done ? 'Mark incomplete' : 'Mark complete'}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        />
      ) : (
        <span className="check" style={{ opacity: 0.25, cursor: 'default' }} />
      )}
      <div className="t-main">
        <div className="t-title">{title}</div>
        <div className="t-sub">
          {groupName && <span className="pill">{groupName}</span>}
          {recurringDays && <span className="tag-rec">🔁 {recurringDays}</span>}
        </div>
      </div>
      {when && <span className="t-when">{when}</span>}
      {onDelete && (
        <button
          className="t-del"
          title="Delete task"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          🗑
        </button>
      )}
    </div>
  );
}
