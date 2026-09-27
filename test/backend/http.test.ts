import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../app';
import { initializeDB, closeDB } from '../../backend/db/connection';
import { register, login } from '../../backend/auth';
import { commitICalImport } from '../../backend/api/ical';
import { createItem, getItems, getItemOccurrences } from '../../backend/api/items';

const download = vi.hoisted(() => vi.fn());
vi.mock('../../backend/api/icalDownload', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../backend/api/icalDownload')>(),
  downloadCalendar: download,
}));
let server: Server;
let base: string;
let uid: string;
let cookie: string;
let importedId: number;
const input = { recurrence: 'ONE_TIME', title: 'Changed', start_date: '2026-07-06T09:00:00Z', end_date: '2026-07-06T10:00:00Z' };

beforeEach(async () => {
  initializeDB(':memory:');
  uid = register('httpuser', 'Password123');
  cookie = `SID=${login('httpuser', 'Password123')}`;
  commitICalImport(uid, 'https://calendar.example/feed', [{ key: 'UNCATEGORISED', include: true, name: 'Calendar' }], [{
    sourceUid: 'exam', summary: 'Exam', start: input.start_date, end: input.end_date,
  }]);
  importedId = getItems(uid)[0].id;
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  closeDB();
  vi.restoreAllMocks();
});
function request(path: string, method: string, body?: unknown, session = cookie) {
  return fetch(base + path, { method, headers: { Cookie: session, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe('HTTP import protections', () => {
  it('returns 409 for imported edits without changing the event or schedule', async () => {
    const before = getItems(uid)[0];
    const occurrences = getItemOccurrences(uid, '2026-07-01', '2026-08-01');
    const res = await request(`/api/items/${importedId}`, 'PUT', input);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ success: false, error: expect.stringContaining('cannot be edited') });
    expect(getItems(uid)[0]).toEqual(before);
    expect(getItemOccurrences(uid, '2026-07-01', '2026-08-01')).toEqual(occurrences);
  });

  it('returns 404 for missing or another user’s imported item', async () => {
    register('other', 'Password123');
    const otherCookie = `SID=${login('other', 'Password123')}`;
    expect((await request(`/api/items/${importedId}`, 'PUT', input, otherCookie)).status).toBe(404);
    expect((await request('/api/items/99999', 'PUT', input)).status).toBe(404);
  });

  it('still edits manual items and completes and deletes imported items', async () => {
    createItem(uid, undefined as unknown as number, 'ONE_TIME', 'Manual', '', '', '', input.start_date, input.end_date, '', [], { hour: 9, minute: 0 }, { hour: 10, minute: 0 });
    const id = getItems(uid).find(item => !item.source_uid)!.id;
    expect((await request(`/api/items/${id}`, 'PUT', input)).status).toBe(200);
    expect(getItems(uid).find(item => item.id === id)!.title).toBe('Changed');
    expect((await request(`/api/items/${importedId}/completion`, 'PATCH', { completed: true })).status).toBe(200);
    expect(getItemOccurrences(uid, '2026-07-01', '2026-08-01').find(o => o.id === importedId)!.completed).toBe(true);
    expect((await request(`/api/items/${importedId}`, 'DELETE')).status).toBe(200);
    expect(getItems(uid).some(item => item.id === importedId)).toBe(false);
  });

  it('refreshes imported fields through the guarded downloader while preserving completion', async () => {
    await request(`/api/items/${importedId}/completion`, 'PATCH', { completed: true });
    download.mockResolvedValue('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:exam\r\nSUMMARY:Updated exam\r\nDTSTART:20260706T090000Z\r\nDTEND:20260706T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR');
    const source = getItems(uid)[0].source_uid;
    const res = await request(`/api/ical/${source}/refresh`, 'POST');
    expect(res.status).toBe(200);
    expect(download).toHaveBeenCalledWith('https://calendar.example/feed');
    expect(getItems(uid)[0]).toMatchObject({ id: importedId, title: 'Updated exam', completed: true });
  });

  it('does not log query tokens', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await request('/api/ical?token=private-feed-token', 'GET');
    expect(log).toHaveBeenCalledWith('GET /api/ical');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-feed-token');
  });
});
