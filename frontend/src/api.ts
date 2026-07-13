import type {
  Item,
  ItemOccurrence,
  ItemInput,
  Group,
  GroupInput,
  ImportPreview,
  ImportResult,
  CourseDecision,
  ParsedICalEvent,
} from './types';
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
  // ---- Items ----
  // Raw source items — drive lists, smart views, and the edit form.
  async getItems(): Promise<Item[]> {
    const data = await request<{ success: boolean; items: Item[] }>('/api/items');
    return data.items;
  },

  // Server-expanded occurrences over the [from, to) window (calendar / agenda).
  async getOccurrences(from: string, to: string): Promise<ItemOccurrence[]> {
    const data = await request<{ success: boolean; items: ItemOccurrence[] }>(
      `/api/items/occurrences?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    return data.items;
  },

  async createItem(input: ItemInput): Promise<void> {
    await request('/api/items', { method: 'POST', body: JSON.stringify(input) });
  },

  async updateItem(id: string, input: ItemInput): Promise<void> {
    await request(`/api/items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  async deleteItem(id: string): Promise<void> {
    await request(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
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

  // ---- iCal import ----
  async previewICalImport(url: string): Promise<ImportPreview> {
    const data = await request<{ success: boolean; preview: ImportPreview }>('/api/ical/preview', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
    return data.preview;
  },

  async commitICalImport(payload: {
    url: string;
    courseDecisions: CourseDecision[];
    events: ParsedICalEvent[];
  }): Promise<ImportResult> {
    const data = await request<{ success: boolean; result: ImportResult }>('/api/ical/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.result;
  },

  // ---- Auth ----
  async logout(): Promise<void> {
    await request('/logout/');
  },
};

export { ApiError };
