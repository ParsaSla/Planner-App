import type { Task, Group, TaskInput, GroupInput, PlannerEvent, EventInput } from './types';
import type { Settings } from './settings';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  // Unauthenticated → bounce to login (session expired or missing).
  if (res.status === 401 || res.status === 403) {
    window.location.href = '/login/';
    throw new ApiError('Not authenticated', res.status);
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }

  if (!res.ok || (body && body.success === false)) {
    throw new ApiError(body?.error || `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

export const api = {
  // ---- Tasks ----
  async getTasks(): Promise<Task[]> {
    const data = await request<{ success: boolean; tasks: Task[] }>('/api/tasks');
    return data.tasks;
  },

  async createTask(input: TaskInput): Promise<void> {
    await request('/api/tasks', { method: 'POST', body: JSON.stringify(input) });
  },

  async updateTask(id: string, input: TaskInput): Promise<void> {
    await request(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  async deleteTask(id: string): Promise<void> {
    await request(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async setOneTimeCompletion(id: string, completed: boolean): Promise<void> {
    await request(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    });
  },

  async setRecurringInstance(id: string, instanceDate: string, completed: boolean): Promise<void> {
    await request(`/api/tasks/${encodeURIComponent(id)}/instance`, {
      method: 'PATCH',
      body: JSON.stringify({ instanceDate, completed }),
    });
  },

  // ---- Events ----
  async getEvents(): Promise<PlannerEvent[]> {
    const data = await request<{ success: boolean; events: PlannerEvent[] }>('/api/events');
    return data.events;
  },

  async createEvent(input: EventInput): Promise<void> {
    await request('/api/events', { method: 'POST', body: JSON.stringify(input) });
  },

  async updateEvent(id: string, input: EventInput): Promise<void> {
    await request(`/api/events/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  async deleteEvent(id: string): Promise<void> {
    await request(`/api/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async setEventCompletion(id: string, completed: boolean): Promise<void> {
    await request(`/api/events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    });
  },

  async setRecurringEventInstance(id: string, instanceDate: string, completed: boolean): Promise<void> {
    await request(`/api/events/${encodeURIComponent(id)}/instance`, {
      method: 'PATCH',
      body: JSON.stringify({ instanceDate, completed }),
    });
  },

  // ---- Groups (a.k.a. Courses on the backend) ----
  async getGroups(): Promise<Group[]> {
    const data = await request<{ success: boolean; courses: Group[] }>('/api/courses');
    return data.courses;
  },

  async createGroup(input: GroupInput): Promise<void> {
    await request('/api/courses', { method: 'POST', body: JSON.stringify(input) });
  },

  async deleteGroup(id: string): Promise<void> {
    await request(`/api/courses/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // ---- Settings ----
  async getSettings(): Promise<Settings> {
    const data = await request<{ success: boolean; settings: Settings }>('/api/settings');
    return data.settings;
  },

  async saveSettings(settings: Settings): Promise<void> {
    await request('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
  },

  // ---- Auth ----
  async logout(): Promise<void> {
    await request('/logout/');
  },
};

export { ApiError };
