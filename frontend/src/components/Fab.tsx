import { useEffect, useRef, useState } from 'react';

export type CreateKind = 'item' | 'group';

interface Props {
  onCreate: (kind: CreateKind) => void;
}

export default function Fab({ onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking outside or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (kind: CreateKind) => {
    setOpen(false);
    onCreate(kind);
  };

  return (
    <div className="fab-wrap" ref={ref}>
      <div className={`fab-menu ${open ? 'open' : ''}`}>
        <button className="fab-item" onClick={() => pick('item')}>
          <span className="fi" style={{ background: '#6d8bff22', color: '#aebdff' }}>
            ✓
          </span>
          New Item
        </button>
        <button className="fab-item" onClick={() => pick('group')}>
          <span className="fi" style={{ background: '#41d0d822', color: '#41d0d8' }}>
            ▣
          </span>
          New Group
        </button>
      </div>
      <button
        className={`fab ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Create"
      >
        ＋
      </button>
    </div>
  );
}
