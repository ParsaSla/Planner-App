import { useState } from 'react';
import { useStore } from './useStore';
import { useSettings } from './settings';
import type { Selection } from './nav';
import type { PlannerItem } from './types';
import { isEventItem } from './types';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import TaskView from './components/TaskView';
import Fab from './components/Fab';
import type { CreateKind } from './components/Fab';
import CreateModal from './components/CreateModal';
import CalendarOverlay from './components/CalendarOverlay';
import SettingsModal from './components/SettingsModal';

interface ModalState {
  initial: CreateKind;
  editingItem?: PlannerItem;
}

export default function App() {
  const store = useStore();
  const settings = useSettings();
  const [selection, setSelection] = useState<Selection>({ kind: 'view', view: 'today' });
  const [query, setQuery] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);

  const openCreate = (kind: CreateKind) => setModal({ initial: kind });
  const openEdit = (item: PlannerItem) =>
    setModal({ initial: isEventItem(item) ? 'event' : 'task', editingItem: item });

  return (
    <div className="app">
      <TopBar query={query} onQuery={setQuery} onOpenCalendar={() => setCalendarOpen(true)} />

      <div className="body">
        <Sidebar
          store={store}
          selection={selection}
          onSelect={setSelection}
          onNewGroup={() => openCreate('group')}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {store.loading ? (
          <main className="main">
            <div className="loading">Loading your planner…</div>
          </main>
        ) : store.error ? (
          <main className="main">
            <div className="empty">
              <div className="ico">⚠️</div>
              <p>{store.error}</p>
              <button className="btn" style={{ marginTop: 14 }} onClick={() => store.reload()}>
                Retry
              </button>
            </div>
          </main>
        ) : (
          <TaskView store={store} selection={selection} query={query} onEdit={openEdit} />
        )}
      </div>

      <Fab onCreate={openCreate} />

      {modal && (
        <CreateModal
          store={store}
          initial={modal.initial}
          editingItem={modal.editingItem}
          onClose={() => setModal(null)}
        />
      )}

      {calendarOpen && (
        <CalendarOverlay store={store} onClose={() => setCalendarOpen(false)} onEdit={openEdit} />
      )}

      {settingsOpen && (
        <SettingsModal settings={settings} store={store} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
