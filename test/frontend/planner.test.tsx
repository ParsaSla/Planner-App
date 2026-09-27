// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../../frontend/src/App';
import CreateModal from '../../frontend/src/components/CreateModal';
import { api } from '../../frontend/src/api';
import { DEFAULT_SETTINGS } from '../../frontend/src/settings';
import type { Item, ItemOccurrence } from '../../frontend/src/types';
import type { Store } from '../../frontend/src/useStore';

let items: Item[];
let subscription = true;
function item(source_uid: number | undefined = 1): Item {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(10);
  return { id: '1', source_uid, title: 'Exam', recurrence: 'ONE_TIME', start_date: start.toISOString(), end_date: end.toISOString(), completed: false };
}
function occurrences(from: string, to: string): ItemOccurrence[] {
  return items.filter(i => i.start_date >= from && i.start_date < to).map(i => ({
    id: i.id, title: i.title, recurrence: i.recurrence, start: i.start_date, end: i.end_date!, completed: i.completed ?? false,
  }));
}
const calendar = () => within(document.querySelector('.cal-overlay') as HTMLElement);

beforeEach(() => {
  items = [item()];
  subscription = true;
  vi.spyOn(api, 'getItems').mockImplementation(async () => items.map(i => ({ ...i })));
  vi.spyOn(api, 'getGroups').mockResolvedValue([]);
  vi.spyOn(api, 'getSettings').mockResolvedValue(DEFAULT_SETTINGS);
  vi.spyOn(api, 'getOccurrences').mockImplementation(async (from, to) => occurrences(from, to));
  vi.spyOn(api, 'getIcals').mockImplementation(async () => subscription ? [{ id: 1, uid: 'owner', url: 'https://calendar.example/feed', active: 1, last_imported: new Date().toISOString() }] : []);
  vi.spyOn(api, 'setCompletion').mockImplementation(async (id, completed) => { items = items.map(i => i.id === id ? { ...i, completed } : i); });
  vi.spyOn(api, 'deleteItem').mockImplementation(async (id) => { items = items.filter(i => i.id !== id); });
  vi.spyOn(api, 'refreshIcal').mockImplementation(async () => {
    items = items.map(i => ({ ...i, title: 'Updated exam' }));
    return { importedEvents: 0, createdCourses: 0, skipped: 0, updated: 1 };
  });
  vi.spyOn(api, 'deleteIcal').mockImplementation(async () => { items = []; subscription = false; });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openPlanner() {
  render(<App />);
  await screen.findByText('Exam');
}
async function openCalendar() {
  fireEvent.click(screen.getByRole('button', { name: /Calendar/ }));
  await waitFor(() => expect(calendar().getByText('Exam')).toBeTruthy());
}

describe('planner calendar interactions', () => {
  it('shows read-only imported details while preserving completion and deletion', async () => {
    await openPlanner();
    fireEvent.click(within(screen.getByRole('main')).getByText('Exam'));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Managed by your calendar subscription.')).toBeTruthy();
    expect(dialog.queryByRole('button', { name: /Edit/ })).toBeNull();
    fireEvent.click(dialog.getByRole('button', { name: 'Mark as complete' }));
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Completed' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(dialog.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.deleteItem).toHaveBeenCalledWith('1');
    expect(within(screen.getByRole('main')).queryByText('Exam')).toBeNull();
  });

  it('still allows opening the manual item editor', async () => {
    items = [item(undefined)];
    delete items[0].source_uid;
    await openPlanner();
    fireEvent.click(screen.getByText('Exam'));
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeTruthy();
  });

  it('guards against opening the editor directly with an imported item', () => {
    render(<CreateModal initial="item" editingItem={item()} store={{} as Store} onClose={vi.fn()} />);
    expect(screen.getByText('Managed by your calendar subscription.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull();
  });

  it('keeps Home intact when navigating Calendar and closing it', async () => {
    await openPlanner();
    await openCalendar();
    fireEvent.click(calendar().getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(calendar().queryByRole('status')).toBeNull());
    expect(calendar().queryByText('Exam')).toBeNull();
    expect(within(screen.getByRole('main')).getByText('Exam')).toBeTruthy();
    fireEvent.click(calendar().getByRole('button', { name: /Close/ }));
    expect(within(screen.getByRole('main')).getByText('Exam')).toBeTruthy();
  });

  it('refreshes both views after actual timetable refresh and removal controls', async () => {
    await openPlanner();
    await openCalendar();
    fireEvent.click(screen.getByRole('button', { name: /Settings/ }));
    fireEvent.click(screen.getByRole('button', { name: /Timetable/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh timetable' }));
    await waitFor(() => {
      expect(within(screen.getByRole('main')).getByText('Updated exam')).toBeTruthy();
      expect(calendar().getByText('Updated exam')).toBeTruthy();
    });
    expect(api.refreshIcal).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove timetable' }));
    await waitFor(() => {
      expect(within(screen.getByRole('main')).queryByRole('status')).toBeNull();
      expect(calendar().queryByRole('status')).toBeNull();
      expect(within(screen.getByRole('main')).queryByText('Updated exam')).toBeNull();
      expect(calendar().queryByText('Updated exam')).toBeNull();
    });
    expect(api.deleteIcal).toHaveBeenCalledWith(1);
  });

  it.each(['home', 'calendar'])('keeps both views mounted while completing an item from %s', async (view) => {
    await openPlanner();
    await openCalendar();
    const homeTitle = within(screen.getByRole('main')).getByText('Exam');
    const calendarTitle = calendar().getByText('Exam');
    const scrollBody = document.querySelector('.tg')!.parentElement!;
    scrollBody.scrollTop = 640;
    const pending: (() => void)[] = [];
    vi.mocked(api.getOccurrences).mockImplementation((from, to) => new Promise(resolve => {
      pending.push(() => resolve(occurrences(from, to)));
    }));
    const source = view === 'home' ? within(screen.getByRole('main')) : calendar();
    fireEvent.click(source.getByTitle('Mark as done'));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(screen.queryByRole('status')).toBeNull();
    expect(within(screen.getByRole('main')).getByText('Exam')).toBe(homeTitle);
    expect(calendar().getByText('Exam')).toBe(calendarTitle);
    expect(scrollBody.scrollTop).toBe(640);
    await act(async () => { pending.forEach(resolve => resolve()); });
    expect(within(screen.getByRole('main')).getByTitle('Mark as not done')).toBeTruthy();
    expect(calendar().getByTitle('Mark as not done')).toBeTruthy();
    expect(scrollBody.isConnected).toBe(true);
    expect(scrollBody.scrollTop).toBe(640);
  });

  it('refreshes both views after completion and item deletion', async () => {
    await openPlanner();
    await openCalendar();
    fireEvent.click(within(screen.getByRole('main')).getByTitle('Mark as done'));
    await waitFor(() => {
      expect(within(screen.getByRole('main')).getByTitle('Mark as not done')).toBeTruthy();
      expect(calendar().getByTitle('Mark as not done')).toBeTruthy();
    });
    fireEvent.click(within(screen.getByRole('main')).getByText('Exam'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(within(screen.getByRole('main')).queryByRole('status')).toBeNull();
      expect(calendar().queryByRole('status')).toBeNull();
      expect(screen.queryByText('Exam')).toBeNull();
    });
  });


  it('submits a numeric course ID when merging an import into an existing course', async () => {
    vi.mocked(api.getGroups).mockResolvedValue([{ id: '7', name: 'Maths' }]);
    vi.spyOn(api, 'previewICalImport').mockResolvedValue({
      events: [{ sourceUid: 'new', summary: 'New exam', start: items[0].start_date, end: items[0].end_date! }],
      proposedCourses: [{ key: 'UNCATEGORISED', name: 'Calendar', suggestedColor: '#6d8bff', eventCount: 1, newEventCount: 1 }],
      alreadyImported: 0,
    });
    vi.spyOn(api, 'commitICalImport').mockResolvedValue({ importedEvents: 1, createdCourses: 0, skipped: 0 });
    await openPlanner();
    fireEvent.click(screen.getByRole('button', { name: /Settings/ }));
    fireEvent.click(screen.getByRole('button', { name: /Timetable/ }));
    fireEvent.change(screen.getByPlaceholderText(/https:.*webcal:/), { target: { value: 'https://calendar.example/new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.change(await within(screen.getByRole('dialog')).findByRole('combobox'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 event' }));
    await waitFor(() => expect(api.commitICalImport).toHaveBeenCalledWith(expect.objectContaining({
      courseDecisions: [expect.objectContaining({ courseId: 7 })],
    })));
    await screen.findByText('Imported 1 event.');
  });

  it('keeps calendar errors local and provides an independent retry', async () => {
    await openPlanner();
    vi.mocked(api.getOccurrences).mockRejectedValueOnce(new Error('Calendar unavailable'));
    fireEvent.click(screen.getByRole('button', { name: /Calendar/ }));
    await screen.findByText('Calendar unavailable');
    expect(within(screen.getByRole('main')).getByText('Exam')).toBeTruthy();
    fireEvent.click(calendar().getByRole('button', { name: 'Retry calendar' }));
    await waitFor(() => expect(calendar().getByText('Exam')).toBeTruthy());
  });
});
