import type { CSSProperties } from 'react';
import { softColor } from '../util';

interface Props {
  title: string;
  color: string;
  groupName?: string;
  /** Right-aligned timing label, e.g. "Today · 5:00 PM". */
  when?: string;
  /** Schedule label for recurring items, e.g. "Mon · Wed · Fri". */
  recurringDays?: string;
  /** Optional location line. */
  location?: string;
  /** Whether the item/occurrence is ticked off. */
  completed?: boolean;
  /** When provided, renders a checkbox that toggles completion. */
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
  location,
  completed,
  onToggle,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div
      className={`task${completed ? ' done' : ''}`}
      style={{ '--c': color, '--cc': softColor(color) } as CSSProperties}
      onClick={onEdit}
    >
      {onToggle && (
        <button
          className="check"
          title={completed ? 'Mark as not done' : 'Mark as done'}
          aria-pressed={completed}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        />
      )}
      <div className="t-main">
        <div className="t-title">{title}</div>
        <div className="t-sub">
          {groupName && <span className="pill">{groupName}</span>}
          {recurringDays && <span className="tag-rec">🔁 {recurringDays}</span>}
          {location && <span className="tag-loc">📍 {location}</span>}
        </div>
      </div>
      {when && <span className="t-when">{when}</span>}
      {onDelete && (
        <button
          className="t-del"
          title="Delete item"
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
