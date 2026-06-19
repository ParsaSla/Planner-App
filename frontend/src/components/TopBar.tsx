import { api } from '../api';

interface Props {
  query: string;
  onQuery: (q: string) => void;
  onOpenCalendar: () => void;
}

export default function TopBar({ query, onQuery, onOpenCalendar }: Props) {
  async function logout() {
    try {
      await api.logout();
    } finally {
      window.location.href = '/login/';
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo">◆</div> Planner
      </div>
      <div className="spacer" />
      <div className="search">
        🔍
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search tasks…"
          aria-label="Search tasks"
        />
      </div>
      <button className="icon-btn primary" onClick={onOpenCalendar}>
        🗓 Calendar
      </button>
      <button className="avatar" onClick={logout} title="Log out">
        ⎋
      </button>
    </header>
  );
}
