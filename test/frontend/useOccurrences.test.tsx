// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { api } from '../../frontend/src/api';
import { useOccurrences } from '../../frontend/src/useOccurrences';
import type { ItemOccurrence } from '../../frontend/src/types';

const occurrence = (title: string): ItemOccurrence => ({ id: '1', title, recurrence: 'ONE_TIME', start: '2026-07-06T09:00:00Z', end: '2026-07-06T10:00:00Z', completed: false });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('independent occurrence queries', () => {
  it('retains loaded events during a revision refresh but clears them when the range changes', async () => {
    const refresh = deferred<ItemOccurrence[]>();
    vi.spyOn(api, 'getOccurrences').mockResolvedValueOnce([occurrence('Exam')]).mockReturnValue(refresh.promise);
    const { result, rerender } = renderHook(
      ({ from, revision }) => useOccurrences(from, '2026-08-01', revision),
      { initialProps: { from: '2026-07-01', revision: 1 } }
    );
    await waitFor(() => expect(result.current.occurrences[0]?.title).toBe('Exam'));
    rerender({ from: '2026-07-01', revision: 2 });
    expect(result.current.loading).toBe(false);
    expect(result.current.occurrences[0].title).toBe('Exam');
    await act(async () => refresh.resolve([{ ...occurrence('Exam'), completed: true }]));
    expect(result.current.occurrences[0].completed).toBe(true);
    rerender({ from: '2026-07-15', revision: 2 });
    expect(result.current.loading).toBe(true);
    expect(result.current.occurrences).toEqual([]);
  });

  it('ignores superseded successful responses and aborts their requests', async () => {
    const old = deferred<ItemOccurrence[]>();
    const next = deferred<ItemOccurrence[]>();
    const query = vi.spyOn(api, 'getOccurrences').mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const { result, rerender } = renderHook(({ from }) => useOccurrences(from, '2026-08-01', 1), { initialProps: { from: '2026-07-01' } });
    const oldSignal = query.mock.calls[0][2];
    rerender({ from: '2026-07-15' });
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => next.resolve([occurrence('New range')]));
    expect(result.current.occurrences[0].title).toBe('New range');
    await act(async () => old.resolve([occurrence('Old range')]));
    expect(result.current.occurrences[0].title).toBe('New range');
  });

  it('ignores stale failures after a revision refresh and after unmount', async () => {
    const old = deferred<ItemOccurrence[]>();
    const query = vi.spyOn(api, 'getOccurrences').mockReturnValueOnce(old.promise).mockResolvedValue([occurrence('Refreshed')]);
    const { result, rerender, unmount } = renderHook(({ revision }) => useOccurrences('2026-07-01', '2026-08-01', revision), { initialProps: { revision: 1 } });
    rerender({ revision: 2 });
    await waitFor(() => expect(result.current.occurrences[0]?.title).toBe('Refreshed'));
    await act(async () => old.reject(new Error('Stale failure')));
    expect(result.current.error).toBeNull();
    const pending = deferred<ItemOccurrence[]>();
    query.mockReturnValueOnce(pending.promise);
    rerender({ revision: 3 });
    const signal = query.mock.calls[2][2];
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.reject(new Error('Unmounted failure')));
  });

  it('keeps separate ranges and errors independent and retries only the failed view', async () => {
    const query = vi.spyOn(api, 'getOccurrences').mockImplementation(async (from) => {
      if (from === 'home') throw new Error('Agenda failed');
      return [occurrence('Calendar')];
    });
    const { result } = renderHook(() => ({ home: useOccurrences('home', 'end', 0), calendar: useOccurrences('calendar', 'end', 0) }));
    await waitFor(() => expect(result.current.home.error).toBe('Agenda failed'));
    expect(result.current.calendar.occurrences[0].title).toBe('Calendar');
    query.mockResolvedValueOnce([occurrence('Home')]);
    act(() => result.current.home.retry());
    await waitFor(() => expect(result.current.home.occurrences[0]?.title).toBe('Home'));
    expect(query.mock.calls.filter(([from]) => from === 'calendar')).toHaveLength(1);
  });
});
