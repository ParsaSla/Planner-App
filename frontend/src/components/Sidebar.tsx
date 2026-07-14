import type { Store } from '../useStore';
import type { Selection } from '../nav';
import { selectionKey } from '../nav';

interface Props {
  store: Store;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onNewGroup: () => void;
  onOpenSettings: () => void;
}

export default function Sidebar({ store, selection, onSelect, onNewGroup, onOpenSettings }: Props) {
  const { items, groups } = store;

  const sel = selectionKey(selection);

  const groupCount = (id: string) => items.filter((i) => i.courseId === id).length;

  return (
    <aside className="sidebar">
      <SmartItem
        icon="🏠"
        label="Home"
        active={sel === 'view:home'}
        onClick={() => onSelect({ kind: 'view', view: 'home' })}
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

      <button className="side-item side-settings" onClick={onOpenSettings}>
        <span className="ico">⚙️</span> <span className="label">Settings</span>
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
