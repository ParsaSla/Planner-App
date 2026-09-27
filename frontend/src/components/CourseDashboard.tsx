import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { api, ApiError } from '../api';
import type { Group } from '../types';
import type { OutlineAssessment, OutlineDeadline, OutlineLink, OutlineResult, OutlineSyncSummary } from '../../../shared/outline';

interface Props {
  group: Group;
  color: string;
  itemCount: number;
  onItemsChanged: () => Promise<void>;
  children: ReactNode;
}

function dateLabel(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function deadlineLabel(deadline: OutlineDeadline): string {
  switch (deadline.kind) {
    case 'datetime': return `${dateLabel(deadline.localDate)} · ${deadline.localTime} (${deadline.timezone ?? 'timezone unconfirmed'})`;
    case 'date': return `${dateLabel(deadline.localDate)} · time unconfirmed`;
    case 'week-range': return `Week ${deadline.week} · ${dateLabel(deadline.rangeStart)} – ${dateLabel(deadline.rangeEnd)}`;
    case 'exam-period': return 'Exam period · date to be confirmed';
    case 'unknown': return 'Date to be confirmed';
  }
}
function safeHref(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
function Links({ links }: { links: OutlineLink[] }) {
  return <ul className="course-links">{links.map((link, i) => <li key={`${link.url}-${i}`}>
    <a href={safeHref(link.url)} target="_blank" rel="noopener noreferrer">{link.label || link.url} <span aria-hidden="true">↗</span></a>
  </li>)}</ul>;
}
function TextBlock({ title, text }: { title: string; text: string }) {
  return text ? <div className="course-text-block"><h4>{title}</h4><p className="course-prose">{text}</p></div> : null;
}
function Assessment({ assessment }: { assessment: OutlineAssessment }) {
  return <article className="course-card assessment-card">
    <header className="assessment-head"><h3>{assessment.title}</h3>
      <span className="assessment-weight">{assessment.weightPercent === null ? 'Weight unconfirmed' : `${assessment.weightPercent}% of course`}</span>
    </header>
    {assessment.deadlines.length > 1 && <p className="course-muted">{assessment.deadlines.length} submissions · the weight applies to this assessment as a whole.</p>}
    <ul className="course-deadlines">{assessment.deadlines.map((deadline, i) => <li key={i}>
      {assessment.deadlines.length > 1 && <strong>{deadline.label}</strong>}
      <span className={deadline.kind === 'unknown' || deadline.kind === 'exam-period' ? 'course-muted' : ''}>{deadlineLabel(deadline)}</span>
      <details className="course-evidence"><summary>Source and date details{assessment.deadlines.length > 1 ? ` for ${deadline.label}` : ''}</summary>
        <p className="course-prose">{deadline.raw || 'No deadline was supplied.'}</p>
        {deadline.kind === 'datetime' && deadline.utc && <p>UTC: {deadline.utc}</p>}
        {deadline.evidence.map((evidence, n) => <p className="course-prose" key={n}>{evidence.text}</p>)}
        {deadline.assumptions.length > 0 && <ul>{deadline.assumptions.map((assumption, n) => <li key={n}>{assumption}</li>)}</ul>}
      </details>
    </li>)}</ul>
    <TextBlock title="Overview" text={assessment.description} />
    <TextBlock title="Submission notes" text={assessment.submissionNotes} />
    <TextBlock title="Requirements to pass" text={assessment.hurdleRules} />
    <TextBlock title="Additional information" text={assessment.additionalInformation} />
    {assessment.learningOutcomes.length > 0 && <details className="course-details"><summary>Learning outcomes</summary>
      <ul>{assessment.learningOutcomes.map((outcome, i) => <li key={i}>{outcome}</li>)}</ul>
    </details>}
    {assessment.scheduleEvidence.length > 0 && <details className="course-details"><summary>Related schedule notes</summary>
      {assessment.scheduleEvidence.map((evidence, i) => <p className="course-prose" key={i}>{evidence.tentative && <strong>Tentative: </strong>}{evidence.text}</p>)}
    </details>}
    {assessment.links.length > 0 && <Links links={assessment.links} />}
  </article>;
}

const RESOURCE_LABELS: Record<string, string> = {
  integrat_expectedresources: 'Prescribed resources', integrat_recommenedres: 'Recommended resources',
  integrat_resourcesreqd: 'Required resources', integrat_handbooklink: 'Course handbook', integrat_timetablelink: 'University timetable',
};

export default function CourseDashboard({ group, color, itemCount, onItemsChanged, children }: Props) {
  const [outline, setOutline] = useState<OutlineResult | null>(null);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sync, setSync] = useState<OutlineSyncSummary | null>(null);
  const [mismatch, setMismatch] = useState<{ url: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const saveRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const request = new AbortController();
    setLoading(true); setError(null); setLoadFailed(false);
    api.syncGroupOutline(group.id, request.signal).then(async result => {
      if (request.signal.aborted) return;
      setOutline(result.outline); setUrl(result.outline?.provenance.sourceUrl ?? '');
      setSync(result.outline ? result.sync : null);
      if (result.outline) await onItemsChanged();
    }).catch(err => {
      if (request.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Could not load the saved course outline.'); setLoadFailed(true);
    }).finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => { request.abort(); saveRequest.current?.abort(); };
  }, [group.id, attempt, onItemsChanged]);

  async function save(link: string, allowCodeMismatch = false) {
    const request = new AbortController();
    saveRequest.current = request;
    setSaving(true); setError(null); setMessage(''); setMismatch(null);
    try {
      const result = await api.saveGroupOutline(group.id, link.trim(), request.signal, allowCodeMismatch);
      if (request.signal.aborted) return;
      setOutline(result.outline); setUrl(result.outline.provenance.sourceUrl); setSync(result.sync);
      setMessage('Outline saved to this course.');
      await onItemsChanged();
    } catch (err) {
      if (request.signal.aborted) return;
      if (err instanceof ApiError && err.code === 'COURSE_OUTLINE_CODE_MISMATCH') {
        setMismatch({ url: link.trim(), message: err.message });
      } else {
        setError(err instanceof Error ? err.message : 'Could not load this outline.');
      }
    } finally {
      if (!request.signal.aborted) setSaving(false);
    }
  }

  const deadlines = outline?.assessments.flatMap(assessment => assessment.deadlines) ?? [];
  return <main className="main course-dashboard" style={{ '--course-color': color } as CSSProperties}>
    <header className="course-header">
      <p className="course-eyebrow">Course dashboard {group.code && <span> / {group.code}</span>}</p>
      <h1><span className="course-mark" aria-hidden="true" />{group.name}</h1>
      <p className="course-muted">Your course outline, assessments, and planner items in one place.</p>
    </header>

    <section className="course-card course-import" aria-labelledby="outline-import-title">
      <div><h2 id="outline-import-title">{outline ? 'Course outline' : 'Bring your course into focus'}</h2>
        <p className="course-muted">Paste the full UNSW course outline link. Confirmed deadlines will automatically appear in your planner.</p></div>
      <form onSubmit={event => { event.preventDefault(); if (!loading && !saving && !loadFailed) void save(url); }}>
        <label htmlFor="course-outline-link">UNSW course outline link</label>
        <div className="course-import-controls"><input id="course-outline-link" type="url" required value={url}
          onChange={event => { setUrl(event.target.value); setMismatch(null); }} placeholder="https://www.unsw.edu.au/course-outlines/course-outline#…"
          disabled={loading || saving || loadFailed} aria-describedby="outline-link-help" />
          <button className="btn primary" disabled={!url.trim() || loading || saving || loadFailed} type="submit">{saving ? 'Loading outline…' : outline ? 'Update outline' : 'Load outline'}</button>
          {outline && <button className="btn" type="button" disabled={loading || saving || loadFailed} onClick={() => void save(outline.provenance.sourceUrl)}>Refresh saved link</button>}
        </div>
        <p id="outline-link-help" className="course-muted">Include the part after # so the year, term, and campus match your offering.</p>
      </form>
      {loading && <p role="status">Loading saved outline…</p>}
      {saving && <p role="status">Fetching your outline and checking assessment dates…</p>}
      {message && <p className="course-success" role="status">{message}</p>}
      {mismatch && <div className="course-mismatch" role="alert">
        <strong>Different course codes</strong>
        <p>{mismatch.message}</p>
        <p>If this is the outline for your course, you can continue.</p>
        <div className="course-import-controls">
          <button className="btn primary" type="button" disabled={saving} onClick={() => void save(mismatch.url, true)}>Continue anyway</button>
          <button className="btn" type="button" onClick={() => setMismatch(null)}>Cancel</button>
        </div>
      </div>}
      {sync && <p className="course-muted" role="status">Planner: {sync.created} added, {sync.updated} updated, {sync.unchanged + sync.linked} already linked, {sync.skipped} not added. Unconfirmed dates stay in the outline; deleted deadlines stay removed.</p>}
      {error && <div className="course-error" role="alert"><p>{error}</p>
        {outline && <p>Your last saved outline is still shown below.</p>}
        {loadFailed && <button className="btn" onClick={() => setAttempt(value => value + 1)}>Retry loading outline</button>}
      </div>}
    </section>

    {outline && <>
      <nav className="course-nav" aria-label="Course sections">
        <a href="#course-overview">Overview</a><a href="#course-assessments">Assessments</a><a href="#course-schedule">Schedule</a>
        <a href="#course-resources">Resources</a><a href="#course-contacts">Contacts</a><a href="#course-items">Planner items</a>
      </nav>
      <div className="course-stats">
        <div><strong>{outline.assessments.length}</strong><span>Assessment groups</span></div>
        <div><strong>{deadlines.filter(deadline => deadline.kind === 'datetime').length}</strong><span>Timed deadlines</span></div>
        <div><strong>{deadlines.filter(deadline => deadline.kind !== 'datetime').length}</strong><span>Dates to review</span></div>
        <div><strong>{itemCount}</strong><span>Planner items</span></div>
      </div>
      <section id="course-overview" className="course-card" aria-labelledby="course-overview-title">
        <div className="course-section-head"><div><p className="course-eyebrow">{outline.course.courseCode} · {outline.course.year} · {outline.course.term}</p>
          <h2 id="course-overview-title">{outline.course.name}</h2></div>
          <a className="course-source" href={safeHref(outline.provenance.sourceUrl)} target="_blank" rel="noopener noreferrer">View university outline ↗</a>
        </div>
        <dl className="course-facts">
          {Object.entries({ 'Teaching period': outline.course.teachingPeriod, Location: outline.course.deliveryLocation,
            Campus: outline.course.campus, Delivery: outline.course.deliveryMode, Format: outline.course.deliveryFormat,
            'Activity group': outline.course.activityGroupId, Timezone: outline.course.timezone,
            Published: outline.provenance.publishedOn,
            'Last fetched': outline.provenance.retrievedAt ? new Date(outline.provenance.retrievedAt).toLocaleString() : null,
          }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not supplied'}</dd></div>)}
        </dl>
        <p className="course-prose">{outline.course.description || 'No course description supplied.'}</p>
      </section>
      {outline.warnings.length > 0 && <details className="course-card course-review"><summary>Review notes <span>{outline.warnings.length}</span></summary>
        <ul>{outline.warnings.map((warning, i) => <li key={i}>{warning.message}</li>)}</ul>
      </details>}
      <section id="course-assessments" aria-labelledby="course-assessments-title">
        <div className="course-section-head"><h2 id="course-assessments-title">Assessments</h2><span className="course-muted">From the course outline</span></div>
        <div className="assessment-grid">{outline.assessments.map(assessment => <Assessment key={assessment.key} assessment={assessment} />)}</div>
        {outline.assessments.length === 0 && <p className="course-muted">No assessments were listed in this outline.</p>}
      </section>
      <section id="course-schedule" className="course-card" aria-labelledby="course-schedule-title">
        <div className="course-section-head"><h2 id="course-schedule-title">Teaching schedule</h2>{outline.schedule.tentative && <span className="course-badge">Tentative</span>}</div>
        <p className="course-prose">{outline.schedule.text || 'No general schedule supplied. Additional source fields are available below.'}</p>
        <Links links={outline.schedule.links} />
      </section>
      <div className="course-support-grid">
        <section id="course-resources" className="course-card" aria-labelledby="course-resources-title"><h2 id="course-resources-title">Resources</h2>
          {outline.resources.length ? outline.resources.map(resource => <div className="course-resource" key={resource.field}>
            <h3>{RESOURCE_LABELS[resource.field] ?? resource.field}</h3><p className="course-prose">{resource.text}</p><Links links={resource.links} />
          </div>) : <p className="course-muted">No resources listed.</p>}
        </section>
        <section id="course-contacts" className="course-card" aria-labelledby="course-contacts-title"><h2 id="course-contacts-title">Teaching contacts</h2>
          {outline.contacts.length ? outline.contacts.map((contact, i) => <article className="course-contact" key={i}>
            <h3>{contact.name || 'Unnamed contact'}</h3><p className="course-muted">{contact.position}</p>
            {contact.email && <a href={safeHref(`mailto:${contact.email}`)}>{contact.email}</a>}
            {contact.location && <p>{contact.location}</p>}{contact.phone && <p>{contact.phone}</p>}
            {contact.availability && <p className="course-prose">{contact.availability}</p>}
          </article>) : <p className="course-muted">No contacts listed.</p>}
        </section>
      </div>
      <details className="course-card course-details"><summary>All extracted data and original source</summary>
        <p className="course-muted">Includes original fields, date evidence, assumptions, and any information that could not be interpreted.</p>
        <pre className="course-raw" tabIndex={0}>{JSON.stringify(outline, null, 2)}</pre>
      </details>
    </>}
    <section id="course-items" aria-labelledby="course-items-title">
      <div className="course-section-head"><h2 id="course-items-title">Planner items</h2><span className="course-muted">{itemCount} in this group</span></div>
      {children}
    </section>
  </main>;
}
