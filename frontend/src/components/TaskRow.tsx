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
  onEdit,
  onDelete,
}: Props) {
  return (
    <div
      className="task"
      style={{ '--c': color, '--cc': softColor(color) } as CSSProperties}
      onClick={onEdit}
    >
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
