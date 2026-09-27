import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../app';
import { initializeDB, closeDB, getSQLiteDB } from '../../backend/db/connection';
import { register, login } from '../../backend/auth';
import { createCourse, getCourses, deleteCourse, updateCourse } from '../../backend/api/courses';
import { getItems, getItemOccurrences, setOneTimeCompletion, deleteItem } from '../../backend/api/items';
import { OutlineError, parseOutlineResponse, parseOutlineUrl } from '../../backend/api/unswOutline';
import { createItemRow } from '../../backend/db/items';
import fixture from '../fixtures/unsw/comp9331-2026-t3.json';

const download = vi.hoisted(() => vi.fn());
vi.mock('../../backend/api/unswOutline', async importOriginal => ({
  ...await importOriginal<typeof import('../../backend/api/unswOutline')>(), fetchCourseOutline: download,
}));
const result = parseOutlineResponse(fixture.response, parseOutlineUrl(fixture.sourceUrl), { retrievedAt: fixture.retrievedAt });
let server: Server;
let base: string;
let cookie: string;
let uid: string;
let id: number;
let directory: string;
let dbPath: string;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'planner-outline-'));
  dbPath = join(directory, 'test.db');
  initializeDB(dbPath);
  uid = register('outlineuser', 'Password123');
  cookie = `SID=${login('outlineuser', 'Password123')}`;
  createCourse('Networks', uid, 'COMP9331');
  id = getCourses(uid)[0].id;
  download.mockReset().mockResolvedValue(structuredClone(result));
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  closeDB(); rmSync(directory, { recursive: true, force: true });
});
function request(method: string, body?: unknown, session = cookie) {
  return fetch(`${base}/api/courses/${id}/outline`, { method,
    headers: { Cookie: session, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function approve(response: Response) {
  const preview = await response.json();
  const approval = await fetch(`${base}/api/courses/${id}/outline/commit`, { method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ draftId: preview.draft.id, candidates: preview.draft.candidates.map((candidate: any) => ({
      id: candidate.id, selected: candidate.selected, label: candidate.deadline.label,
      localDate: candidate.editLocalDate ?? ('localDate' in candidate.deadline ? candidate.deadline.localDate : ''),
      localTime: candidate.editLocalTime || (candidate.deadline.kind === 'datetime' ? candidate.deadline.localTime : null),
      timezone: candidate.editTimezone || (candidate.deadline.kind === 'datetime' ? candidate.deadline.timezone : null),
    })) }),
  });
  return { preview, approval, result: await approval.json() };
}

describe('course outline persistence and HTTP ownership', () => {
  it('returns null for a course with no saved outline', async () => {
    const response = await request('GET');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, outline: null });
    expect(download).not.toHaveBeenCalled();
  });
  it('saves the complete extraction without calendar writes until explicit approval', async () => {
    const response = await request('PUT', { url: fixture.sourceUrl });
    expect(response.status).toBe(200);
    const preview = await response.json();
    expect(preview).toMatchObject({ success: true, outline: result, draft: { courseId: id, committedAt: null } });
    expect(getItems(uid)).toEqual([]);
    closeDB(); initializeDB(dbPath);
    expect(await (await request('GET')).json()).toEqual({ success: true, outline: result });
    expect(download).toHaveBeenCalledTimes(1);
    expect(getItems(uid)).toEqual([]);
    const pending = await fetch(`${base}/api/courses/${id}/outline/draft`, { headers: { Cookie: cookie } });
    const approved = await approve(pending);
    expect(approved.result.sync).toMatchObject({ created: 6, updated: 0, skipped: 0 });
    expect(getItems(uid)).toHaveLength(6);
    expect(getCourses(uid)[0]).toMatchObject({ course_name: 'Networks', course_code: 'COMP9331' });
  });
  it.each(['GET', 'PUT'])('requires authentication for %s', async method => {
    expect((await request(method, method === 'PUT' ? { url: fixture.sourceUrl, allowCodeMismatch: true } : undefined, '')).status).toBe(401);
    expect(download).not.toHaveBeenCalled();
  });
  it('does not mutate items during preview and rejects committing the same draft twice', async () => {
    const previewResponse = await request('PUT', { url: fixture.sourceUrl });
    const preview = await previewResponse.json();
    expect(getItems(uid)).toEqual([]);
    const first = await approve(new Response(JSON.stringify(preview), { headers: { 'Content-Type': 'application/json' } }));
    expect(first.approval.status).toBe(200);
    expect(getItems(uid)).toHaveLength(6);
    const repeated = await fetch(`${base}/api/courses/${id}/outline/commit`, { method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: preview.draft.id, candidates: preview.draft.candidates.map((candidate: any) => ({
        id: candidate.id, selected: candidate.selected, label: candidate.deadline.label,
        localDate: candidate.editLocalDate ?? ('localDate' in candidate.deadline ? candidate.deadline.localDate : ''),
        localTime: candidate.editLocalTime || (candidate.deadline.kind === 'datetime' ? candidate.deadline.localTime : null),
        timezone: candidate.editTimezone || (candidate.deadline.kind === 'datetime' ? candidate.deadline.timezone : null),
      })) }),
    });
    expect(repeated.status).toBe(409);
    expect(getItems(uid)).toHaveLength(6);
  });
  it('allows a user to resolve a week-range candidate with an explicit date and time', async () => {
    const preview = await (await request('PUT', { url: fixture.sourceUrl })).json();
    const range = preview.draft.candidates.find((candidate: any) => candidate.deadline.kind === 'week-range');
    expect(range).toBeTruthy();
    const candidates = preview.draft.candidates.map((candidate: any) => ({
      id: candidate.id, selected: candidate.id === range.id,
      label: candidate.id === range.id ? 'Midterm exam' : candidate.deadline.label,
      localDate: candidate.id === range.id ? '2026-10-26' : '',
      localTime: candidate.id === range.id ? '09:00' : null,
      timezone: candidate.id === range.id ? 'Australia/Sydney' : null,
    }));
    const response = await fetch(`${base}/api/courses/${id}/outline/commit`, { method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: preview.draft.id, candidates }),
    });
    expect(response.status).toBe(200);
    expect(getItems(uid)).toHaveLength(1);
    expect(getItems(uid)[0]).toMatchObject({ title: 'Midterm exam', start_date: '2026-10-25T22:00:00.000Z', timezone: 'Australia/Sydney' });
  });
  it('expands a reviewed weekly lab series into following-Tuesday due tasks', async () => {
    const preview = await (await request('PUT', { url: fixture.sourceUrl })).json();
    const raw = 'Start Date 10:00 AM, each Tuesday. Due Date 10:00 AM, the following Tuesday.';
    const candidate = { id: 'ai-series-assessment-1-1', assessmentKey: 'assessment-1',
      deadline: { kind: 'unknown', label: 'Labs', raw, evidence: [{ path: 'assessment.assessment-1.submissionNotes', text: raw }], assumptions: [] },
      source: 'ai', selected: false, sourceKey: 'stable-labs-series', weeklySeries: {
        weekday: 'TUESDAY', releaseTime: '10:00', dueTime: '10:00', dueOffsetDays: 7,
        firstReleaseDate: null, lastReleaseDate: null, timezone: 'Australia/Sydney',
      } };
    const stagedDraft = { ...preview.draft, candidates: [candidate] };
    getSQLiteDB().prepare('UPDATE course_outline_import_drafts SET draft_json = ? WHERE course_id = ?')
      .run(JSON.stringify(stagedDraft), id);
    const response = await fetch(`${base}/api/courses/${id}/outline/commit`, { method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: stagedDraft.id, candidates: [{ id: candidate.id, selected: true, label: 'Labs',
        localDate: '', localTime: null, timezone: 'Australia/Sydney',
        firstReleaseDate: '2026-09-29', lastReleaseDate: '2026-10-13' }] }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).sync.created).toBe(3);
    expect(getItems(uid).map(item => item.start_date)).toEqual([
      '2026-10-05T23:00:00.000Z', '2026-10-12T23:00:00.000Z', '2026-10-19T23:00:00.000Z',
    ]);
    expect(getItems(uid).every(item => item.title === 'Labs' && item.timezone === 'Australia/Sydney')).toBe(true);
  });
  it.each(['GET', 'PUT'])('rejects another user’s course for %s before fetching', async method => {
    register('outsider', 'Password123');
    const session = `SID=${login('outsider', 'Password123')}`;
    expect((await request(method, method === 'PUT' ? { url: fixture.sourceUrl, allowCodeMismatch: true } : undefined, session)).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });
  it.each([{}, { url: 42 }, { url: 'https://example.com' }, { url: fixture.sourceUrl, allowCodeMismatch: 'true' }])('rejects invalid links and confirmation flags', async body => {
    expect((await request('PUT', body)).status).toBe(400);
    expect(download).not.toHaveBeenCalled();
  });
  it('warns before fetching a different code and saves it only after continuing', async () => {
    updateCourse(uid, id, { code: 'COMP3331' });
    const warning = await request('PUT', { url: fixture.sourceUrl });
    expect(warning.status).toBe(409);
    expect(await warning.json()).toMatchObject({ code: 'COURSE_OUTLINE_CODE_MISMATCH', error: expect.stringContaining('COMP3331') });
    expect(download).not.toHaveBeenCalled();
    expect((await (await request('GET')).json()).outline).toBeNull();
    const accepted = await request('PUT', { url: fixture.sourceUrl, allowCodeMismatch: true });
    expect(accepted.status).toBe(200);
    const outline = (await accepted.json()).outline;
    expect(outline.course.courseCode).toBe('COMP9331');
    expect(outline.warnings).toContainEqual(expect.objectContaining({ code: 'COURSE_CODE_MISMATCH' }));
    expect(getCourses(uid)[0].course_code).toBe('COMP3331');
    expect((await (await request('GET')).json()).outline).toEqual(outline);
  });
  it('still rejects an unexpected offering returned by UNSW after continuing', async () => {
    updateCourse(uid, id, { code: 'COMP3331' });
    download.mockRejectedValueOnce(new OutlineError('OFFERING_MISMATCH', 'The returned course does not match the requested offering.'));
    expect((await request('PUT', { url: fixture.sourceUrl, allowCodeMismatch: true })).status).toBe(400);
    expect((await (await request('GET')).json()).outline).toBeNull();
  });
  it('requires another warning if the group code changes during an accepted fetch', async () => {
    updateCourse(uid, id, { code: 'COMP3331' });
    download.mockImplementationOnce(async () => { updateCourse(uid, id, { code: 'COMP1511' }); return result; });
    const response = await request('PUT', { url: fixture.sourceUrl, allowCodeMismatch: true });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('COMP1511');
  });
  it('preserves the saved outline on a failed refresh', async () => {
    await request('PUT', { url: fixture.sourceUrl });
    download.mockRejectedValueOnce(new OutlineError('FETCH_TIMEOUT', 'The UNSW outline request timed out.'));
    const failed = await request('PUT', { url: fixture.sourceUrl });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ error: expect.stringContaining('timed out') });
    expect((await (await request('GET')).json()).outline).toEqual(result);
  });
  it('replaces one snapshot on refresh and cascades it when the course is deleted', async () => {
    await approve(await request('PUT', { url: fixture.sourceUrl }));
    const updated = structuredClone(result); updated.course.description = 'Updated description';
    download.mockResolvedValueOnce(updated);
    const refresh = await request('PUT', { url: fixture.sourceUrl });
    expect(refresh.status).toBe(200);
    expect((await refresh.json()).draft.committedAt).toBeNull();
    expect((await (await request('GET')).json()).outline.course.description).toBe('Updated description');
    expect(getItems(uid)).toHaveLength(6);
    expect(getSQLiteDB().prepare('SELECT * FROM course_outlines').all()).toHaveLength(1);
    deleteCourse(uid, id);
    expect(getSQLiteDB().prepare('SELECT * FROM course_outlines').all()).toHaveLength(0);
  });
  it('does not recreate an outline for a course deleted while fetching', async () => {
    download.mockImplementationOnce(async () => { deleteCourse(uid, id); return result; });
    expect((await request('PUT', { url: fixture.sourceUrl })).status).toBe(404);
    expect(getSQLiteDB().prepare('SELECT * FROM course_outlines').all()).toHaveLength(0);
  });
  it('creates five separate lab deadlines and one assignment, with timezone-aware occurrences', async () => {
    await approve(await request('PUT', { url: fixture.sourceUrl }));
    const items = getItems(uid);
    const labs = items.filter(item => /^Lab \d+$/.test(item.title));
    expect(labs).toHaveLength(5);
    expect(labs.map(item => item.start_date)).toEqual([
      '2026-09-29T07:00:00.000Z', '2026-10-06T06:00:00.000Z', '2026-10-13T06:00:00.000Z',
      '2026-11-10T06:00:00.000Z', '2026-11-17T06:00:00.000Z',
    ]);
    for (const item of items) {
      expect(item).toMatchObject({ courseId: id, outline_course_id: id, kind: 'TASK', recurrence: 'ONE_TIME', completed: false });
      expect(item.end_date).toBe(item.start_date);
      expect(item.description).toContain('Course outline:');
    }
    expect(labs[0].description).toContain('shared across all submissions');
    expect(getItemOccurrences(uid, '2026-09-01', '2026-12-01')).toHaveLength(6);
    expect(items.some(item => /exam/i.test(item.title))).toBe(false);
  });
  it('does not duplicate deadlines when refreshing or when assessment order changes', async () => {
    await approve(await request('PUT', { url: fixture.sourceUrl }));
    const ids = getItems(uid).map(item => item.id);
    const updated = structuredClone(result); updated.assessments.reverse();
    updated.assessments.forEach((assessment, index) => { assessment.key = `assessment-${index}`; });
    download.mockResolvedValueOnce(updated);
    const response = await request('PUT', { url: fixture.sourceUrl });
    const approved = await approve(response);
    expect(approved.result.sync).toMatchObject({ created: 0, unchanged: 6 });
    expect(getItems(uid).map(item => item.id)).toEqual(ids);
  });
  it('keeps the same managed item when a reviewed title is edited and later refreshed', async () => {
    const response = await request('PUT', { url: fixture.sourceUrl });
    const preview = await response.json();
    const target = preview.draft.candidates.find((candidate: any) => candidate.id === 'unsw-assessment-1-1');
    const edited = { ...preview, draft: { ...preview.draft, candidates: preview.draft.candidates.map((candidate: any) => ({
      ...candidate, selected: candidate.id === target.id,
      deadline: candidate.id === target.id ? { ...candidate.deadline, label: 'My custom assignment title' } : candidate.deadline,
    })) } };
    await approve(new Response(JSON.stringify(edited), { headers: { 'Content-Type': 'application/json' } }));
    const customItem = getItems(uid).find(item => item.title === 'My custom assignment title')!;
    const refreshed = await request('PUT', { url: fixture.sourceUrl });
    const approved = await approve(refreshed);
    expect(approved.result.sync).toMatchObject({ created: 5, updated: 1 });
    expect(getItems(uid).find(item => item.id === customItem.id)?.title).toBe('Programming Assignmnent');
    expect(getItems(uid)).toHaveLength(6);
  });
  it('updates a changed deadline without resetting completion or item identity', async () => {
    await approve(await request('PUT', { url: fixture.sourceUrl }));
    const original = getItems(uid).find(item => item.title === 'Lab 1')!;
    setOneTimeCompletion(uid, original.id, true);
    const updated = structuredClone(result);
    Object.assign(updated.assessments[1].deadlines[0], { localDate: '2026-09-30', utc: '2026-09-30T07:00:00.000Z' });
    download.mockResolvedValueOnce(updated);
    const response = await request('PUT', { url: fixture.sourceUrl });
    const approved = await approve(response);
    expect(approved.result.sync).toMatchObject({ created: 0, updated: 1 });
    expect(getItems(uid).find(item => item.id === original.id)).toMatchObject({ completed: true, start_date: '2026-09-30T07:00:00.000Z' });
  });
  it('keeps deleted deadlines removed on read-only load and confirmed refresh', async () => {
    await approve(await request('PUT', { url: fixture.sourceUrl }));
    deleteItem(uid, getItems(uid).find(item => item.title === 'Lab 1')!.id);
    const refreshed = await request('PUT', { url: fixture.sourceUrl });
    expect(getItems(uid)).toHaveLength(5);
    await approve(refreshed);
    const response = await fetch(`${base}/api/courses/${id}/outline/sync`, { method: 'POST', headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect((await response.json()).sync).toMatchObject({ created: 0, skipped: 0 });
    expect(getItems(uid)).toHaveLength(5);
    expect(getItems(uid).some(item => item.title === 'Lab 1')).toBe(false);
  });
  it('links a matching manual item without overwriting its notes or taking over editing', async () => {
    const existing = createItemRow({ uid, course_id: id, kind: 'TASK', recurrence: 'ONE_TIME', title: 'COMP9331 Lab 1 deadline',
      description: 'Personal notes', start_date: '2026-09-29T07:00:00Z', end_date: '2026-09-29T07:30:00Z', completed: 1, created_at: new Date().toISOString() });
    const response = await request('PUT', { url: fixture.sourceUrl });
    const approved = await approve(response);
    expect(approved.result.sync).toMatchObject({ created: 5, linked: 1 });
    expect(getItems(uid)).toHaveLength(6);
    expect(getItems(uid).find(item => item.id === existing)).toMatchObject({ description: 'Personal notes', completed: true, outline_course_id: undefined });
    await approve(await request('PUT', { url: fixture.sourceUrl }));
    expect(getItems(uid)).toHaveLength(6);
  });
  it('loads a previously saved outline without backfilling calendar items', async () => {
    getSQLiteDB().prepare('INSERT INTO course_outlines (course_id, result_json, updated_at) VALUES (?, ?, ?)')
      .run(id, JSON.stringify(result), new Date().toISOString());
    const url = `${base}/api/courses/${id}/outline/sync`;
    expect((await fetch(url, { method: 'POST' })).status).toBe(401);
    register('syncoutsider', 'Password123');
    expect((await fetch(url, { method: 'POST', headers: { Cookie: `SID=${login('syncoutsider', 'Password123')}` } })).status).toBe(404);
    const response = await fetch(url, { method: 'POST', headers: { Cookie: cookie } });
    expect((await response.json()).sync.created).toBe(0);
    expect(download).not.toHaveBeenCalled();
    expect(getItems(uid)).toHaveLength(0);
  });
  it('protects outline-managed details while allowing completion and deletion', async () => {
    await approve(await request('PUT', { url: fixture.sourceUrl }));
    const item = getItems(uid)[0];
    const response = await fetch(`${base}/api/items/${item.id}`, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Changed', recurrence: 'ONE_TIME', start_date: item.start_date, end_date: item.end_date }) });
    expect(response.status).toBe(409);
    setOneTimeCompletion(uid, item.id, true);
    expect(getItems(uid).find(value => value.id === item.id)).toMatchObject({ recurrence: 'ONE_TIME', completed: true });
    deleteItem(uid, item.id);
    expect(getItems(uid)).toHaveLength(5);
  });
  it('rolls back both items and snapshot if importing fails midway', async () => {
    getSQLiteDB().exec("CREATE TRIGGER fail_outline_item BEFORE INSERT ON items WHEN NEW.title = 'Lab 2' BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    const preview = await request('PUT', { url: fixture.sourceUrl });
    expect(preview.status).toBe(200);
    const { approval } = await approve(preview);
    expect(approval.status).toBe(500);
    expect(getItems(uid)).toEqual([]);
    expect((await (await request('GET')).json()).outline).toEqual(result);
    expect(getSQLiteDB().prepare('SELECT * FROM course_outline_items').all()).toEqual([]);
  });

});
