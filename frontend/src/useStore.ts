import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { Item, ItemOccurrence, ItemInput, Group, GroupInput } from './types';
import { colorForGroup } from './util';

export interface Store {
  /** Raw source items — drive lists, smart views, and the edit form. */
  items: Item[];
  /** Server-expanded occurrences for the currently-viewed window. */
  occurrences: ItemOccurrence[];
  groups: Group[];
  loading: boolean;
  error: string | null;
  /** group id → resolved display color (honours fallback palette). */
  groupColor: (groupId?: string) => string;
  groupById: (id?: string) => Group | undefined;
  reload: () => Promise<void>;
  /** Fetch expanded occurrences for [from, to); called by the calendar and Today agenda. */
  loadOccurrences: (from: Date, to: Date) => Promise<void>;
  createItem: (input: ItemInput) => Promise<void>;
  updateItem: (id: string, input: ItemInput) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  createGroup: (input: GroupInput) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
}

export function useStore(): Store {
  const [items, setItems] = useState<Item[]>([]);
  const [occurrences, setOccurrences] = useState<ItemOccurrence[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Remember the last requested occurrence window so a mutation can refresh it.
  const lastRange = useRef<{ from: Date; to: Date } | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const [i, g] = await Promise.all([api.getItems(), api.getGroups()]);
      setItems(i);
      setGroups(g);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOccurrences = useCallback(async (from: Date, to: Date) => {
    lastRange.current = { from, to };
    try {
      const occ = await api.getOccurrences(from.toISOString(), to.toISOString());
      setOccurrences(occ);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load occurrences');
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Stable color assignment: index by group order for the fallback palette.
  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    groups.forEach((g, i) => m.set(g.id, colorForGroup(g, i)));
    return m;
  }, [groups]);

  const groupById = useCallback((id?: string) => groups.find((g) => g.id === id), [groups]);

  const groupColor = useCallback(
    (groupId?: string) => (groupId && colorMap.get(groupId)) || colorForGroup(undefined),
    [colorMap]
  );

  // Mutate-then-reload; also refresh the active occurrence window so the calendar
  // and agenda reflect the change immediately.
  const run = useCallback(
    (fn: () => Promise<void>) => async () => {
      await fn();
      await reload();
      if (lastRange.current) {
        await loadOccurrences(lastRange.current.from, lastRange.current.to);
      }
    },
    [reload, loadOccurrences]
  );

  return {
    items,
    occurrences,
    groups,
    loading,
    error,
    groupColor,
    groupById,
    reload,
    loadOccurrences,
    createItem: (input) => run(() => api.createItem(input))(),
    updateItem: (id, input) => run(() => api.updateItem(id, input))(),
    deleteItem: (id) => run(() => api.deleteItem(id))(),
    createGroup: (input) => run(() => api.createGroup(input))(),
    deleteGroup: (id) => run(() => api.deleteGroup(id))(),
  };
}
