import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Task, Group, TaskInput, GroupInput, PlannerEvent, EventInput } from './types';
import { colorForGroup } from './util';

export interface Store {
  tasks: Task[];
  events: PlannerEvent[];
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
  createEvent: (input: EventInput) => Promise<void>;
  updateEvent: (id: string, input: EventInput) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  toggleEventCompletion: (id: string, completed: boolean) => Promise<void>;
  toggleEventInstance: (id: string, instanceDate: string, completed: boolean) => Promise<void>;
  createGroup: (input: GroupInput) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
}

export function useStore(): Store {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const [t, e, g] = await Promise.all([api.getTasks(), api.getEvents(), api.getGroups()]);
      setTasks(t);
      setEvents(e);
      setGroups(g);
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

  const run = useCallback(
    (fn: () => Promise<void>) => async () => {
      await fn();
      await reload();
    },
    [reload]
  );

  return {
    tasks,
    events,
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
    createEvent: (input) => run(() => api.createEvent(input))(),
    updateEvent: (id, input) => run(() => api.updateEvent(id, input))(),
    deleteEvent: (id) => run(() => api.deleteEvent(id))(),
    toggleEventCompletion: (id, completed) => run(() => api.setEventCompletion(id, completed))(),
    toggleEventInstance: (id, instanceDate, completed) =>
      run(() => api.setRecurringEventInstance(id, instanceDate, completed))(),
    createGroup: (input) => run(() => api.createGroup(input))(),
    deleteGroup: (id) => run(() => api.deleteGroup(id))(),
  };
}
