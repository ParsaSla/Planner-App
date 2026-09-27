import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { IncomingMessage, RequestOptions } from 'node:http';
import type { LookupFunction } from 'node:net';
import { downloadCalendar, normalizeICalUrl } from '../../backend/api/icalDownload';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), http: vi.fn(), https: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:http', () => ({ request: mocks.http }));
vi.mock('node:https', () => ({ request: mocks.https }));

const CALENDAR = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR';
interface Fixture {
  status?: number;
  headers?: Record<string, string>;
  chunks?: (string | Buffer)[];
  stall?: boolean;
  error?: Error;
  delayMs?: number;
  openBody?: boolean;
}
let fixtures: Fixture[];
let requests: { url: URL; options: RequestOptions; destroyed: boolean }[];
let responses: PassThrough[];

function requestFixture(url: URL, options: RequestOptions, callback: (res: IncomingMessage) => void) {
  const fixture = fixtures.shift() ?? {};
  const record = { url, options, destroyed: false };
  requests.push(record);
  const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
  req.destroy = () => { record.destroyed = true; };
  req.end = () => {
    const abort = () => { req.destroy(); req.emit('error', new Error('aborted')); };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (fixture.stall) return;
    const deliver = () => {
      if (fixture.error) { req.emit('error', fixture.error); return; }
      const res = Object.assign(new PassThrough(), {
        statusCode: fixture.status ?? 200,
        headers: fixture.headers ?? {},
      });
      responses.push(res);
      res.on('close', () => options.signal?.removeEventListener('abort', abort));
      callback(res as unknown as IncomingMessage);
      if (!res.destroyed) {
        for (const chunk of fixture.chunks ?? [CALENDAR]) res.write(chunk);
        if (!fixture.openBody) res.end();
      }
    };
    if (fixture.delayMs) setTimeout(deliver, fixture.delayMs);
    else queueMicrotask(deliver);
  };
  return req;
}

beforeEach(() => {
  fixtures = [];
  requests = [];
  responses = [];
  mocks.lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  mocks.http.mockReset().mockImplementation(requestFixture);
  mocks.https.mockReset().mockImplementation(requestFixture);
});
afterEach(() => { for (const res of responses) res.destroy(); vi.useRealTimers(); });

describe('guarded calendar downloads', () => {
  it('downloads HTTP and webcal calendars and pins both forms of DNS lookup', async () => {
    expect(await downloadCalendar('webcal://calendar.example/feed?token=secret')).toBe(CALENDAR);
    expect(requests[0].url.hostname).toBe('calendar.example');
    expect(mocks.https).toHaveBeenCalledOnce();
    expect(requests[0].options.agent).toBe(false);
    expect(requests[0].options.headers).toMatchObject({ 'Accept-Encoding': 'identity' });
    const lookup = requests[0].options.lookup as LookupFunction;
    const single = vi.fn();
    const all = vi.fn();
    lookup('calendar.example', {}, single);
    lookup('calendar.example', { all: true }, all);
    expect(single).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(all).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
    expect(mocks.lookup).toHaveBeenCalledOnce();
    expect(await downloadCalendar('http://calendar.example/feed')).toBe(CALENDAR);
    expect(mocks.http).toHaveBeenCalledOnce();
  });

  it.each([
    'http://127.0.0.1/calendar', 'http://2130706433/calendar', 'http://10.0.0.1/',
    'http://172.16.0.1/', 'http://192.168.1.2/', 'http://169.254.169.254/',
    'http://100.64.0.1/', 'http://0.0.0.0/', 'http://224.0.0.1/', 'http://192.0.2.1/',
    'http://[::1]/', 'http://[fc00::1]/', 'http://[fe80::1]/', 'http://[2001:db8::1]/',
    'http://[::127.0.0.1]/', 'http://[4000::1]/', 'http://[64:ff9b::a00:1]/',
    'http://[::ffff:127.0.0.1]/', 'http://[::ffff:10.0.0.1]/',
    'https://user:password@calendar.example/', 'file:///tmp/calendar.ics',
  ])('rejects unsafe URL %s before connecting', async (url) => {
    await expect(downloadCalendar(url)).rejects.toMatchObject({ errorCode: 'INVALID_ICAL_URL' });
    expect(requests).toHaveLength(0);
  });

  it('rejects DNS names resolving to private addresses or mixed answers', async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    await expect(downloadCalendar('https://private.example/')).rejects.toMatchObject({ errorCode: 'INVALID_ICAL_URL' });
    mocks.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }, { address: '::1', family: 6 }]);
    await expect(downloadCalendar('https://mixed.example/')).rejects.toMatchObject({ errorCode: 'INVALID_ICAL_URL' });
    expect(requests).toHaveLength(0);
  });

  it('validates each redirect including changed DNS answers on the same host', async () => {
    fixtures.push({ status: 302, headers: { location: '/next' } });
    mocks.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);
    await expect(downloadCalendar('https://calendar.example/start')).rejects.toMatchObject({ errorCode: 'INVALID_ICAL_URL' });
    expect(requests).toHaveLength(1);
  });

  it('blocks a redirect to an internal address', async () => {
    fixtures.push({ status: 302, headers: { location: 'http://169.254.169.254/latest' } });
    await expect(downloadCalendar('https://calendar.example/')).rejects.toMatchObject({ errorCode: 'INVALID_ICAL_URL' });
    expect(requests).toHaveLength(1);
  });

  it('allows three redirects but rejects a fourth', async () => {
    fixtures.push(...Array.from({ length: 3 }, () => ({ status: 302, headers: { location: '/next' } })));
    expect(await downloadCalendar('https://calendar.example/')).toBe(CALENDAR);
    requests = [];
    fixtures.push(...Array.from({ length: 4 }, () => ({ status: 307, headers: { location: '/next' } })));
    await expect(downloadCalendar('https://calendar.example/')).rejects.toThrow('redirected too many times');
    expect(requests).toHaveLength(4);
  });

  it('rejects compressed bodies and oversized declared or streamed bodies', async () => {
    fixtures.push({ headers: { 'content-encoding': 'gzip' } });
    await expect(downloadCalendar('https://calendar.example/')).rejects.toThrow('compressed');
    fixtures.push({ headers: { 'content-length': String(5 * 1024 * 1024 + 1) } });
    await expect(downloadCalendar('https://calendar.example/')).rejects.toThrow('5 MiB');
    fixtures.push({ chunks: [Buffer.alloc(5 * 1024 * 1024), Buffer.from('x')] });
    await expect(downloadCalendar('https://calendar.example/')).rejects.toThrow('5 MiB');
    expect(requests.every((req) => req.destroyed)).toBe(true);
  });

  it('aborts stalled requests at the total deadline', async () => {
    vi.useFakeTimers();
    fixtures.push({ stall: true });
    const result = expect(downloadCalendar('https://calendar.example/')).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
    expect(requests[0].destroyed).toBe(true);
  });

  it('includes DNS resolution in the deadline and never connects after it expires', async () => {
    vi.useFakeTimers();
    let resolve!: (addresses: { address: string; family: number }[]) => void;
    mocks.lookup.mockReturnValue(new Promise((done) => { resolve = done; }));
    const result = expect(downloadCalendar('https://calendar.example/')).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
    resolve([{ address: '93.184.216.34', family: 4 }]);
    await Promise.resolve();
    expect(requests).toHaveLength(0);
  });


  it('uses one deadline across redirects and streamed bodies', async () => {
    vi.useFakeTimers();
    fixtures.push({ status: 302, headers: { location: '/next' }, delayMs: 6_000 }, { openBody: true, chunks: ['BEGIN:VCALENDAR'] });
    const result = expect(downloadCalendar('https://calendar.example/')).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(6_000);
    expect(requests).toHaveLength(2);
    expect(requests[1].destroyed).toBe(false);
    await vi.advanceTimersByTimeAsync(4_000);
    await result;
    expect(requests[1].destroyed).toBe(true);
  });

  it('accepts public IPv6 and an exactly 5 MiB response', async () => {
    fixtures.push({ chunks: [Buffer.alloc(5 * 1024 * 1024, 'x')] });
    const body = await downloadCalendar('https://[2606:4700:4700::1111]/feed');
    expect(Buffer.byteLength(body)).toBe(5 * 1024 * 1024);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it('does not expose tokens in network errors', async () => {
    fixtures.push({ error: new Error('failed https://calendar.example/?token=secret') });
    await expect(downloadCalendar('https://calendar.example/?token=secret')).rejects.toThrow('Could not download that calendar');
  });

  it('normalizes webcal and rejects credentials before fetching', () => {
    expect(normalizeICalUrl(' WEBCAL://calendar.example/feed ')).toBe('https://calendar.example/feed');
    expect(() => normalizeICalUrl('https://token@calendar.example/')).toThrow();
  });
});
