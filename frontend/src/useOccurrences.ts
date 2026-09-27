import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { ItemOccurrence } from './types';

/** Each caller owns its range and state; null bounds disable a hidden view's query. */
export function useOccurrences(from: string | null, to: string | null, revision: number) {
  const [attempt, setAttempt] = useState(0);
  const rangeKey = JSON.stringify([from, to]);
  const key = JSON.stringify([rangeKey, revision, attempt]);
  const [result, setResult] = useState<{
    key: string;
    rangeKey: string;
    items: ItemOccurrence[];
    error: string | null;
  } | null>(null);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!from || !to) return;
    const controller = new AbortController();
    let active = true;
    api.getOccurrences(from, to, controller.signal).then(
      (items) => { if (active) setResult({ key, rangeKey, items, error: null }); },
      (error: unknown) => {
        if (active) setResult({ key, rangeKey, items: [], error: error instanceof Error ? error.message : 'Failed to load occurrences' });
      }
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [from, to, key, rangeKey]);

  // Revalidate an already loaded range in the background without unmounting its
  // rows or resetting calendar scroll. A different range still starts loading,
  // and an old failure is cleared when retrying.
  const current = result?.rangeKey === rangeKey && (result.key === key || !result.error)
    ? result
    : null;
  return {
    occurrences: current?.items ?? [],
    loading: Boolean(from && to && !current),
    error: current?.error ?? null,
    retry,
  };
}
