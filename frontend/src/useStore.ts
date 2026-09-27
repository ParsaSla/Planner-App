import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Item, ItemInput, Group, GroupInput } from './types';
import { colorForGroup } from './util';

export interface Store {
  /** Raw source items — drive lists, smart views, and the edit form. */
  items: Item[];
  /** Invalidates each view's independent occurrence query after data changes. */
  revision: number;
  groups: Group[];
  loading: boolean;
  error: string | null;
  /** group id → resolved display color (honours fallback palette). */
  groupColor: (groupId?: string) => string;
  groupById: (id?: string) => Group | undefined;
  reload: () => Promise<void>;
  createItem: (input: ItemInput) => Promise<void>;
  updateItem: (id: string, input: ItemInput) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  /**
   * Toggle completion. Omit `start` for a ONE_TIME item; pass the occurrence's start instant
   * (ItemOccurrence.start) to tick a single RECURRING occurrence.
   */
  setCompletion: (id: string, completed: boolean, start?: string) => Promise<void>;
  createGroup: (input: GroupInput) => Promise<void>;
  updateGroup: (id: string, input: GroupInput) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
}

export function useStore(): Store {
  const [items, setItems] = useState<Item[]>([]);
  const [revision, setRevision] = useState(0);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const [i, g] = await Promise.all([api.getItems(), api.getGroups()]);
      setItems(i);
      setGroups(g);
      setRevision((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
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

  // Mutate-then-reload invalidates every mounted occurrence view.
  const run = useCallback(
    (fn: () => Promise<void>) => async () => {
      await fn();
      await reload();
    },
    [reload]
  );

  return {
    items,
    revision,
    groups,
    loading,
    error,
    groupColor,
    groupById,
    reload,
    createItem: (input) => run(() => api.createItem(input))(),
    updateItem: (id, input) => run(() => api.updateItem(id, input))(),
    deleteItem: (id) => run(() => api.deleteItem(id))(),
    setCompletion: (id, completed, start) => run(() => api.setCompletion(id, completed, start))(),
    createGroup: (input) => run(() => api.createGroup(input))(),
    updateGroup: (id, input) => run(() => api.updateGroup(id, input))(),
    deleteGroup: (id) => run(() => api.deleteGroup(id))(),
  };
}
