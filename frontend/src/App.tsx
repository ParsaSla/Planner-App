import { useState } from 'react';
import { useStore } from './useStore';
import type { Selection } from './nav';
import type { Task } from './types';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import TaskView from './components/TaskView';
import Fab from './components/Fab';
import type { CreateKind } from './components/Fab';
import CreateModal from './components/CreateModal';
import CalendarOverlay from './components/CalendarOverlay';

interface ModalState {
  initial: CreateKind;
  editingTask?: Task;
}

export default function App() {
  const store = useStore();
  const [selection, setSelection] = useState<Selection>({ kind: 'view', view: 'today' });
  const [query, setQuery] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);

  const openCreate = (kind: CreateKind) => setModal({ initial: kind });
  const openEdit = (task: Task) => setModal({ initial: 'task', editingTask: task });

  return (
    <div className="app">
      <TopBar query={query} onQuery={setQuery} onOpenCalendar={() => setCalendarOpen(true)} />

      <div className="body">
        <Sidebar
          store={store}
          selection={selection}
          onSelect={setSelection}
          onNewGroup={() => openCreate('group')}
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
          <TaskView
            store={store}
            selection={selection}
            query={query}
            onEdit={openEdit}
            onCreate={() => openCreate('task')}
          />
        )}
      </div>

      <Fab onCreate={openCreate} />

      {modal && (
        <CreateModal
          store={store}
          initial={modal.initial}
          editingTask={modal.editingTask}
          onClose={() => setModal(null)}
        />
      )}

      {calendarOpen && (
        <CalendarOverlay store={store} onClose={() => setCalendarOpen(false)} onEdit={openEdit} />
      )}
    </div>
  );
}
