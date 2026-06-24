import { useEffect, useState } from 'react';
import type { SettingsStore, TermDate, TermSystem, UniversitySettings } from '../settings';
import { EMPTY_TERM_DATE, termCount } from '../settings';

interface Props {
  settings: SettingsStore;
  onClose: () => void;
}

type Tab = 'university';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'university', icon: '🎓', label: 'University' },
];

const TERM_LABELS = ['Term 1', 'Term 2', 'Term 3'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function SettingsModal({ settings, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('university');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="mi">⚙️</div>
          <h3>Settings</h3>
          <button className="x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="settings-body">
          <nav className="settings-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`settings-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span className="ico">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {tab === 'university' && (
              <UniversityTab settings={settings} onClose={onClose} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UniversityTab({ settings, onClose }: { settings: SettingsStore; onClose: () => void }) {
  const initial = settings.settings.university;
  const [teachingPeriodWeeks, setTeachingPeriodWeeks] = useState(String(initial.teachingPeriodWeeks));
  const [termWeeks, setTermWeeks] = useState(String(initial.termWeeks));
  const [termSystem, setTermSystem] = useState<TermSystem>(initial.termSystem);
  const [flexWeek, setFlexWeek] = useState(String(initial.flexWeek));
  const [termStartDates, setTermStartDates] = useState<TermDate[]>(initial.termStartDates);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const count = termCount(termSystem);
  // Keep the start-date array sized to the current term system.
  const dates = Array.from({ length: count }, (_, i) => termStartDates[i] ?? { ...EMPTY_TERM_DATE });

  const setDate = (i: number, patch: Partial<TermDate>) =>
    setTermStartDates((cur) => {
      const next = Array.from({ length: count }, (_, k) => cur[k] ?? { ...EMPTY_TERM_DATE });
      next[i] = { ...next[i], ...patch };
      return next;
    });

  async function handleSave() {
    setError(null);
    const tp = Number(teachingPeriodWeeks);
    const tw = Number(termWeeks);
    const fw = Number(flexWeek);
    if (!Number.isFinite(tp) || tp < 1) return setError('Teaching period must be at least 1 week.');
    if (!Number.isFinite(tw) || tw < 1) return setError('Term duration must be at least 1 week.');
    if (!Number.isFinite(fw) || fw < 1 || fw > tw)
      return setError(`Flex week must be between 1 and ${tw}.`);

    const next: UniversitySettings = {
      teachingPeriodWeeks: Math.round(tp),
      termWeeks: Math.round(tw),
      termSystem,
      termStartDates: dates,
      flexWeek: Math.round(fw),
    };

    setSaving(true);
    try {
      await settings.saveUniversity(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  // Editing any field invalidates the "saved" confirmation.
  const dirty = () => setSaved(false);

  return (
    <>
      <div className="settings-pane">
        <div className="row">
          <div className="field">
            <label>Teaching period duration (weeks)</label>
            <input
              type="number"
              min={1}
              value={teachingPeriodWeeks}
              onChange={(e) => {
                setTeachingPeriodWeeks(e.target.value);
                dirty();
              }}
            />
          </div>
          <div className="field">
            <label>Term duration (weeks)</label>
            <input
              type="number"
              min={1}
              value={termWeeks}
              onChange={(e) => {
                setTermWeeks(e.target.value);
                dirty();
              }}
            />
          </div>
        </div>

        <div className="field">
          <label>Terms per year</label>
          <div className="type-toggle">
            <button
              type="button"
              className={termSystem === 'SEMESTER' ? 'active' : ''}
              onClick={() => {
                setTermSystem('SEMESTER');
                dirty();
              }}
            >
              Semester (2)
            </button>
            <button
              type="button"
              className={termSystem === 'TRIMESTER' ? 'active' : ''}
              onClick={() => {
                setTermSystem('TRIMESTER');
                dirty();
              }}
            >
              Trimester (3)
            </button>
          </div>
        </div>

        <div className="field">
          <label>Term start dates</label>
          <div className="settings-terms">
            {dates.map((d, i) => (
              <div className="settings-term-row" key={i}>
                <span className="settings-term-label">{TERM_LABELS[i]}</span>
                <select
                  value={d.day || ''}
                  onChange={(e) => {
                    setDate(i, { day: Number(e.target.value) });
                    dirty();
                  }}
                >
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, k) => k + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <select
                  value={d.month || ''}
                  onChange={(e) => {
                    setDate(i, { month: Number(e.target.value) });
                    dirty();
                  }}
                >
                  <option value="">Month</option>
                  {MONTHS.map((m, k) => (
                    <option key={m} value={k + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Flex week</label>
          <input
            type="number"
            min={1}
            max={Number(termWeeks) || undefined}
            value={flexWeek}
            onChange={(e) => {
              setFlexWeek(e.target.value);
              dirty();
            }}
          />
          <p className="field-hint">The non-teaching week within a term, e.g. week 5 or 6.</p>
        </div>

        {error && <div className="form-error">{error}</div>}
      </div>

      <div className="modal-foot">
        {saved && <span className="settings-saved">Saved ✓</span>}
        <button className="btn" onClick={onClose}>
          Close
        </button>
        <button className="btn primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </>
  );
}
