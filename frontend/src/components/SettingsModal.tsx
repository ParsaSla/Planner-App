import { useEffect, useState } from 'react';
import type { SettingsStore, TermDate, TermPeriod, TermSystem, UniversitySettings } from '../settings';
import { EMPTY_TERM_PERIOD, termCount } from '../settings';
import type { Store } from '../useStore';
import { api } from '../api';
import type { ImportPreview, ImportResult } from '../types';

interface Props {
  settings: SettingsStore;
  store: Store;
  onClose: () => void;
}

type Tab = 'university' | 'timetable';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'university', icon: '🎓', label: 'University' },
  { id: 'timetable', icon: '📥', label: 'Timetable' },
];

const TERM_LABELS = ['Term 1', 'Term 2', 'Term 3'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function SettingsModal({ settings, store, onClose }: Props) {
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
            {tab === 'timetable' && (
              <TimetableTab settings={settings} store={store} onClose={onClose} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UniversityTab({ settings, onClose }: { settings: SettingsStore; onClose: () => void }) {
  const initial = settings.settings.university;
  const [termSystem, setTermSystem] = useState<TermSystem>(initial.termSystem);
  const [flexWeek, setFlexWeek] = useState(String(initial.flexWeek));
  const [termDates, setTermDates] = useState<TermPeriod[]>(initial.termDates);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const count = termCount(termSystem);
  // Keep the term-date array sized to the current term system.
  const dates = Array.from({ length: count }, (_, i) => termDates[i] ?? { ...EMPTY_TERM_PERIOD });

  const setDate = (i: number, bound: 'start' | 'end', patch: Partial<TermDate>) =>
    setTermDates((cur) => {
      const next = Array.from({ length: count }, (_, k) => cur[k] ?? { ...EMPTY_TERM_PERIOD });
      next[i] = { ...next[i], [bound]: { ...next[i][bound], ...patch } };
      return next;
    });

  async function handleSave() {
    setError(null);
    const fw = Number(flexWeek);
    if (!Number.isFinite(fw) || fw < 1) return setError('Flex week must be at least 1.');

    const next: UniversitySettings = {
      termSystem,
      termDates: dates,
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
          <label>Term start &amp; end dates</label>
          <div className="settings-terms">
            {dates.map((d, i) => (
              <div className="settings-term-row" key={i}>
                <span className="settings-term-label">{TERM_LABELS[i]}</span>
                <TermDatePicker
                  legend="Start"
                  value={d.start}
                  onChange={(patch) => {
                    setDate(i, 'start', patch);
                    dirty();
                  }}
                />
                <TermDatePicker
                  legend="End"
                  value={d.end}
                  onChange={(patch) => {
                    setDate(i, 'end', patch);
                    dirty();
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Flex week</label>
          <input
            type="number"
            min={1}
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

const SWATCHES = ['#6d8bff', '#ff7a90', '#3ecf8e', '#f0b429', '#b07cff', '#41d0d8', '#ff9d5c'];

interface DecisionState {
  include: boolean;
  name: string;
  code?: string;
  color: string;
  /** '' = create a new course; otherwise attach to this existing group id. */
  courseId: string;
}

function TimetableTab({
  settings,
  store,
  onClose,
}: {
  settings: SettingsStore;
  store: Store;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(settings.settings.icalUrl ?? '');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'review' | 'importing'>('idle');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, DecisionState>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handlePreview() {
    setError(null);
    setResult(null);
    if (!url.trim()) return setError('Paste your timetable’s iCal link first.');
    setPhase('loading');
    try {
      const p = await api.previewICalImport(url.trim());
      setPreview(p);
      const next: Record<string, DecisionState> = {};
      for (const pc of p.proposedCourses) {
        next[pc.key] = {
          include: pc.newEventCount > 0,
          name: pc.name,
          code: pc.code,
          color: pc.suggestedColor,
          courseId: pc.matchedCourseId ?? '',
        };
      }
      setDecisions(next);
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that calendar.');
      setPhase('idle');
    }
  }

  function patch(key: string, p: Partial<DecisionState>) {
    setDecisions((cur) => ({ ...cur, [key]: { ...cur[key], ...p } }));
  }

  async function handleImport() {
    if (!preview) return;
    setError(null);
    setPhase('importing');
    try {
      const courseDecisions = Object.entries(decisions).map(([key, d]) => ({
        key,
        include: d.include,
        name: d.name,
        code: d.code,
        color: d.courseId ? undefined : d.color,
        courseId: d.courseId || undefined,
      }));
      const res = await api.commitICalImport({ url: url.trim(), courseDecisions, events: preview.events });
      await store.reload();
      setResult(res);
      setPreview(null);
      setPhase('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
      setPhase('review');
    }
  }

  const includedCount =
    preview?.proposedCourses.reduce(
      (sum, pc) => (decisions[pc.key]?.include ? sum + pc.newEventCount : sum),
      0
    ) ?? 0;

  return (
    <>
      <div className="settings-pane">
        <div className="field">
          <label>Timetable iCal link</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…  or  webcal://…"
          />
          <p className="field-hint">
            Paste your university timetable’s iCal/subscription URL. We’ll sort classes into
            courses for you to review before anything is saved.
          </p>
        </div>

        {result && (
          <div className="import-result">
            Imported {result.importedEvents} event{result.importedEvents === 1 ? '' : 's'}
            {result.createdCourses > 0 && ` into ${result.createdCourses} new course${result.createdCourses === 1 ? '' : 's'}`}
            {result.skipped > 0 && ` · ${result.skipped} skipped`}.
          </div>
        )}

        {preview && phase !== 'loading' && (
          <div className="field">
            <label>
              Review courses{' '}
              {preview.alreadyImported > 0 && (
                <span className="import-note">({preview.alreadyImported} already imported)</span>
              )}
            </label>
            {preview.proposedCourses.length === 0 && (
              <p className="field-hint">No events found in that calendar.</p>
            )}
            <div className="import-courses">
              {preview.proposedCourses.map((pc) => {
                const d = decisions[pc.key];
                if (!d) return null;
                const creatingNew = !d.courseId;
                return (
                  <div className={`import-course ${d.include ? '' : 'excluded'}`} key={pc.key}>
                    <div className="import-course-head">
                      <label className="import-include">
                        <input
                          type="checkbox"
                          checked={d.include}
                          onChange={(e) => patch(pc.key, { include: e.target.checked })}
                        />
                      </label>
                      {creatingNew && (
                        <span
                          className="import-dot"
                          style={{ background: d.color }}
                          aria-hidden="true"
                        />
                      )}
                      <input
                        className="import-name"
                        value={d.name}
                        onChange={(e) => patch(pc.key, { name: e.target.value })}
                        disabled={!d.include || !creatingNew}
                        placeholder="Course name"
                      />
                      <span className="import-count">
                        {pc.newEventCount}/{pc.eventCount}
                      </span>
                    </div>

                    {d.include && (
                      <div className="import-course-opts">
                        <select
                          value={d.courseId}
                          onChange={(e) => patch(pc.key, { courseId: e.target.value })}
                        >
                          <option value="">＋ New course</option>
                          {store.groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              Merge into {g.name}
                            </option>
                          ))}
                        </select>
                        {creatingNew && (
                          <>
                            <input
                              className="import-code"
                              value={d.code ?? ''}
                              onChange={(e) => patch(pc.key, { code: e.target.value })}
                              placeholder="Code"
                            />
                            <div className="swatches import-swatches">
                              {SWATCHES.map((c) => (
                                <div
                                  key={c}
                                  className={`sw ${d.color === c ? 'active' : ''}`}
                                  style={{ background: c }}
                                  onClick={() => patch(pc.key, { color: c })}
                                />
                              ))}
                              <label className="sw custom" title="Custom colour" style={{ background: d.color }}>
                                <input
                                  type="color"
                                  value={d.color}
                                  onChange={(e) => patch(pc.key, { color: e.target.value })}
                                />
                              </label>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
      </div>

      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          Close
        </button>
        {preview ? (
          <button
            className="btn primary"
            onClick={handleImport}
            disabled={phase === 'importing' || includedCount === 0}
          >
            {phase === 'importing'
              ? 'Importing…'
              : includedCount > 0
              ? `Import ${includedCount} event${includedCount === 1 ? '' : 's'}`
              : 'Nothing to import'}
          </button>
        ) : (
          <button className="btn primary" onClick={handlePreview} disabled={phase === 'loading'}>
            {phase === 'loading' ? 'Reading…' : 'Preview'}
          </button>
        )}
      </div>
    </>
  );
}

function TermDatePicker({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: TermDate;
  onChange: (patch: Partial<TermDate>) => void;
}) {
  return (
    <div className="settings-term-date">
      <span className="settings-term-legend">{legend}</span>
      <select value={value.day || ''} onChange={(e) => onChange({ day: Number(e.target.value) })}>
        <option value="">Day</option>
        {Array.from({ length: 31 }, (_, k) => k + 1).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <select value={value.month || ''} onChange={(e) => onChange({ month: Number(e.target.value) })}>
        <option value="">Month</option>
        {MONTHS.map((m, k) => (
          <option key={m} value={k + 1}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
