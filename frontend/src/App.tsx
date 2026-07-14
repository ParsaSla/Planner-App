import { useState } from 'react';
import { useStore } from './useStore';
import { useSettings } from './settings';
import type { Selection } from './nav';
import type { Item } from './types';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import TaskView from './components/TaskView';
import Fab from './components/Fab';
import type { CreateKind } from './components/Fab';
import CreateModal from './components/CreateModal';
import DetailModal from './components/DetailModal';
import type { DetailTarget } from './components/DetailModal';
import CalendarOverlay from './components/CalendarOverlay';
import SettingsModal from './components/SettingsModal';

interface ModalState {
  initial: CreateKind;
  editingItem?: Item;
}

export default function App() {
  const store = useStore();
  const settings = useSettings();
  const [selection, setSelection] = useState<Selection>({ kind: 'view', view: 'home' });
  const [query, setQuery] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [detail, setDetail] = useState<DetailTarget | null>(null);

  const openCreate = (kind: CreateKind) => setModal({ initial: kind });
  const openEdit = (item: Item) => setModal({ initial: 'item', editingItem: item });
  const openDetail = (target: DetailTarget) => setDetail(target);
  // Clicking Edit inside the detail view hands off to the editor.
  const editFromDetail = (item: Item) => {
    setDetail(null);
    openEdit(item);
  };

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
          <TaskView store={store} selection={selection} query={query} onOpenDetail={openDetail} />
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

      {detail && (
        <DetailModal
          store={store}
          target={detail}
          onClose={() => setDetail(null)}
          onEdit={editFromDetail}
        />
      )}

      {calendarOpen && (
        <CalendarOverlay
          store={store}
          onClose={() => setCalendarOpen(false)}
          onOpenDetail={openDetail}
        />
      )}

      {settingsOpen && (
        <SettingsModal settings={settings} store={store} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
