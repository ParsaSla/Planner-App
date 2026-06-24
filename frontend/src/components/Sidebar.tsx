import type { Store } from '../useStore';
import type { Selection } from '../nav';
import { selectionKey } from '../nav';
import { isOneTime, isRecurring } from '../types';
import { dayKey } from '../util';

interface Props {
  store: Store;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onNewGroup: () => void;
}

export default function Sidebar({ store, selection, onSelect, onNewGroup }: Props) {
  const { tasks, events, groups } = store;
  const todayKey = dayKey(new Date());
  const todayName = dayName(new Date());

  // Counts for the smart views.
  const todayCount =
    tasks.filter((t) => {
      if (isOneTime(t)) return !t.completed && dayKey(new Date(t.date)) === todayKey;
      return isRecurring(t) && t.days.some((d) => todayName === d);
    }).length +
    events.filter((e) =>
      e.type === 'ONE_TIME'
        ? dayKey(new Date(e.start)) === todayKey
        : e.days.some((d) => todayName === d)
    ).length;
  const allCount = tasks.filter((t) => !(isOneTime(t) && t.completed)).length;
  const recurringCount = tasks.filter(isRecurring).length;
  const eventsCount = events.length;

  const sel = selectionKey(selection);

  const groupCount = (id: string) =>
    tasks.filter((t) => t.course_id === id && !(isOneTime(t) && t.completed)).length +
    events.filter((e) => e.course_id === id).length;

  return (
    <aside className="sidebar">
      <SmartItem
        icon="📅"
        label="Today"
        count={todayCount}
        active={sel === 'view:today'}
        onClick={() => onSelect({ kind: 'view', view: 'today' })}
      />
      <SmartItem
        icon="📋"
        label="All Tasks"
        count={allCount}
        active={sel === 'view:all'}
        onClick={() => onSelect({ kind: 'view', view: 'all' })}
      />
      <SmartItem
        icon="🔁"
        label="Recurring"
        count={recurringCount}
        active={sel === 'view:recurring'}
        onClick={() => onSelect({ kind: 'view', view: 'recurring' })}
      />
      <SmartItem
        icon="📅"
        label="Events"
        count={eventsCount}
        active={sel === 'view:events'}
        onClick={() => onSelect({ kind: 'view', view: 'events' })}
      />
      <SmartItem
        icon="✓"
        label="Completed"
        active={sel === 'view:completed'}
        onClick={() => onSelect({ kind: 'view', view: 'completed' })}
      />

      <div className="side-label">Groups</div>
      {groups.map((g) => {
        const key = `group:${g.id}`;
        return (
          <button
            key={g.id}
            className={`side-item ${sel === key ? 'active' : ''}`}
            onClick={() => onSelect({ kind: 'group', id: g.id })}
          >
            <span className="dot" style={{ background: store.groupColor(g.id) }} />
            <span className="label">{g.name}</span>
            <span className="count">{groupCount(g.id)}</span>
            <span
              className="del"
              title="Delete group"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete group "${g.name}"? Tasks will keep their data but lose this group.`)) {
                  store.deleteGroup(g.id);
                }
              }}
            >
              ✕
            </span>
          </button>
        );
      })}
      <button className="side-item side-add" onClick={onNewGroup}>
        <span className="ico">＋</span> <span className="label">New group</span>
      </button>
    </aside>
  );
}

function SmartItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`side-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="ico">{icon}</span>
      <span className="label">{label}</span>
      {count !== undefined && count > 0 && <span className="count">{count}</span>}
    </button>
  );
}

function dayName(d: Date) {
  return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][d.getDay()];
}
