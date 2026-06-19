import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Task, Group, TaskInput, GroupInput } from './types';
import { colorForGroup } from './util';

export interface Store {
  tasks: Task[];
  groups: Group[];
  loading: boolean;
  error: string | null;
  /** group id → resolved display color (honours fallback palette). */
  groupColor: (groupId?: string) => string;
  groupById: (id?: string) => Group | undefined;
  reload: () => Promise<void>;
  createTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: string, input: TaskInput) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleOneTime: (id: string, completed: boolean) => Promise<void>;
  toggleInstance: (id: string, instanceDate: string, completed: boolean) => Promise<void>;
  createGroup: (input: GroupInput) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
}

export function useStore(): Store {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const [t, g] = await Promise.all([api.getTasks(), api.getGroups()]);
      setTasks(t);
      setGroups(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
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

  const run = useCallback(
    (fn: () => Promise<void>) => async () => {
      await fn();
      await reload();
    },
    [reload]
  );

  return {
    tasks,
    groups,
    loading,
    error,
    groupColor,
    groupById,
    reload,
    createTask: (input) => run(() => api.createTask(input))(),
    updateTask: (id, input) => run(() => api.updateTask(id, input))(),
    deleteTask: (id) => run(() => api.deleteTask(id))(),
    toggleOneTime: (id, completed) => run(() => api.setOneTimeCompletion(id, completed))(),
    toggleInstance: (id, instanceDate, completed) =>
      run(() => api.setRecurringInstance(id, instanceDate, completed))(),
    createGroup: (input) => run(() => api.createGroup(input))(),
    deleteGroup: (id) => run(() => api.deleteGroup(id))(),
  };
}
