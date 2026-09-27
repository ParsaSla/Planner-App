// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../../frontend/src/App';
import { api, ApiError } from '../../frontend/src/api';
import { DEFAULT_SETTINGS } from '../../frontend/src/settings';
import { parseOutlineResponse, parseOutlineUrl } from '../../backend/api/unswOutline';
import type { OutlineResult, SavedOutlineResult } from '../../shared/outline';
import fixture from '../fixtures/unsw/comp9331-2026-t3.json';

const result = parseOutlineResponse(fixture.response, parseOutlineUrl(fixture.sourceUrl), { retrievedAt: fixture.retrievedAt });
const sync = { created: 6, updated: 0, unchanged: 0, linked: 0, skipped: 2 };
let saved: OutlineResult | null;
beforeEach(() => {
  saved = null;
  vi.spyOn(api, 'getItems').mockResolvedValue([{ id: '1', courseId: '1', title: 'Existing lab prep', recurrence: 'ONE_TIME',
    start_date: '2026-09-29T06:00:00Z', end_date: '2026-09-29T07:00:00Z', completed: false }]);
  vi.spyOn(api, 'getGroups').mockResolvedValue([{ id: '1', name: 'Networks', code: 'COMP9331' }, { id: '2', name: 'Other course' }]);
  vi.spyOn(api, 'getSettings').mockResolvedValue(DEFAULT_SETTINGS);
  vi.spyOn(api, 'getOccurrences').mockResolvedValue([]);
  vi.spyOn(api, 'syncGroupOutline').mockImplementation(async id => ({ outline: id === '1' ? saved : null, sync: { ...sync, created: 0, unchanged: saved ? 6 : 0 } }));
  vi.spyOn(api, 'saveGroupOutline').mockImplementation(async () => { saved = structuredClone(result); return { outline: saved, sync }; });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function openCourse() {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Networks/ }));
  await waitFor(() => expect(screen.queryByText('Loading saved outline…')).toBeNull());
}
function loadOutline() {
  fireEvent.change(screen.getByLabelText('UNSW course outline link'), { target: { value: fixture.sourceUrl } });
  fireEvent.click(screen.getByRole('button', { name: 'Load outline' }));
}

describe('course dashboards', () => {
  it('loads a pasted link, shows all extracted sections and keeps planner items working', async () => {
    await openCourse();
    expect(screen.getByText('Existing lab prep')).toBeTruthy();
    loadOutline();
    await screen.findByText('Outline saved to this course.');
    expect(api.saveGroupOutline).toHaveBeenCalledWith('1', fixture.sourceUrl, expect.any(AbortSignal), false);
    for (const title of ['Computer Networks and Applications', 'Assessments', 'Teaching schedule', 'Resources', 'Teaching contacts', 'Planner items']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
    expect(screen.getByRole('heading', { name: 'Programming Assignmnent' })).toBeTruthy();
    expect(screen.getByText('Lab 5', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('Must obtain at least 40%')).toBeTruthy();
    expect(screen.getByText('Exam period · date to be confirmed')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'wen.hu@unsw.edu.au' }).getAttribute('href')).toBe('mailto:wen.hu@unsw.edu.au');
    expect(screen.getByText('All extracted data and original source')).toBeTruthy();
    const original = JSON.parse(document.querySelector('.course-raw')!.textContent!);
    expect(original.provenance.rawResponse).toEqual(fixture.response);
    expect(screen.getByText('Existing lab prep')).toBeTruthy();
    fireEvent.click(screen.getByText('Existing lab prep'));
    expect(within(screen.getByRole('dialog')).getByText('Existing lab prep')).toBeTruthy();
  });
  it('offers a warning and retries the same outline with explicit confirmation', async () => {
    vi.mocked(api.getGroups).mockResolvedValue([{ id: '1', name: 'Networks', code: 'COMP3331' }]);
    vi.mocked(api.saveGroupOutline).mockRejectedValueOnce(new ApiError(
      'This outline is for COMP9331, but this group has course code COMP3331.', 409, 'COURSE_OUTLINE_CODE_MISMATCH',
    ));
    await openCourse(); loadOutline();
    const proceed = await screen.findByRole('button', { name: 'Continue anyway' });
    expect(screen.getByText('Different course codes')).toBeTruthy();
    expect(api.saveGroupOutline).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Outline saved to this course.')).toBeNull();
    fireEvent.click(proceed);
    await screen.findByText('Outline saved to this course.');
    expect(api.saveGroupOutline).toHaveBeenLastCalledWith('1', fixture.sourceUrl, expect.any(AbortSignal), true);
    expect(screen.queryByRole('button', { name: 'Continue anyway' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Programming Assignmnent' })).toBeTruthy();
  });
  it('cancels a mismatch warning without replacing the saved outline', async () => {
    saved = structuredClone(result);
    vi.mocked(api.saveGroupOutline).mockRejectedValueOnce(new ApiError('Different course codes.', 409, 'COURSE_OUTLINE_CODE_MISMATCH'));
    await openCourse();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved link' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Continue anyway' })).toBeNull();
    expect(api.saveGroupOutline).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Programming Assignmnent' })).toBeTruthy();
  });
  it('clears the warning when the link changes, so confirmation cannot apply to another URL', async () => {
    vi.mocked(api.saveGroupOutline).mockRejectedValueOnce(new ApiError('Different course codes.', 409, 'COURSE_OUTLINE_CODE_MISMATCH'));
    await openCourse(); loadOutline();
    await screen.findByRole('button', { name: 'Continue anyway' });
    fireEvent.change(screen.getByLabelText('UNSW course outline link'), { target: { value: fixture.sourceUrl.replace('COMP9331', 'COMP1511') } });
    expect(screen.queryByRole('button', { name: 'Continue anyway' })).toBeNull();
    expect(api.saveGroupOutline).toHaveBeenCalledTimes(1);
  });
  it('restores a saved outline when returning to the course', async () => {
    await openCourse(); loadOutline(); await screen.findByText('Outline saved to this course.');
    fireEvent.click(screen.getByRole('button', { name: /Other course/ }));
    await waitFor(() => expect(screen.queryByText('Loading saved outline…')).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Programming Assignmnent' })).toBeNull();
    expect((screen.getByLabelText('UNSW course outline link') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /Networks/ }));
    await screen.findByRole('heading', { name: 'Programming Assignmnent' });
    expect(api.saveGroupOutline).toHaveBeenCalledTimes(1);
  });
  it('retains the saved information and link when refresh fails', async () => {
    saved = structuredClone(result); await openCourse();
    vi.mocked(api.saveGroupOutline).mockRejectedValueOnce(new Error('UNSW is unavailable.'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved link' }));
    await screen.findByRole('alert');
    expect(screen.getByText('UNSW is unavailable.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Programming Assignmnent' })).toBeTruthy();
    expect((screen.getByLabelText('UNSW course outline link') as HTMLInputElement).value).toBe(result.provenance.sourceUrl);
    expect(screen.getByText('Your last saved outline is still shown below.')).toBeTruthy();
  });
  it('offers retry after a saved-outline load error', async () => {
    vi.mocked(api.syncGroupOutline).mockRejectedValueOnce(new Error('Connection lost.'));
    await openCourse();
    expect((screen.getByLabelText('UNSW course outline link') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading outline' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect((screen.getByLabelText('UNSW course outline link') as HTMLInputElement).disabled).toBe(false);
  });
  it('ignores an old course load that resolves after switching groups', async () => {
    let resolveFirst!: (value: { outline: OutlineResult | null; sync: typeof sync }) => void;
    vi.mocked(api.syncGroupOutline).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Networks/ }));
    await screen.findByText('Loading saved outline…');
    fireEvent.click(screen.getByRole('button', { name: /Other course/ }));
    await waitFor(() => expect(screen.queryByText('Loading saved outline…')).toBeNull());
    await act(async () => { resolveFirst({ outline: result, sync }); });
    expect(screen.getByRole('heading', { name: 'Other course' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Programming Assignmnent' })).toBeNull();
  });
  it('ignores an old save result after switching groups and disables duplicate submits', async () => {
    let resolveSave!: (value: SavedOutlineResult) => void;
    vi.mocked(api.saveGroupOutline).mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
    await openCourse(); loadOutline();
    expect((screen.getByRole('button', { name: 'Loading outline…' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Other course/ }));
    await waitFor(() => expect(screen.queryByText('Loading saved outline…')).toBeNull());
    await act(async () => { resolveSave({ outline: result, sync }); });
    expect(screen.queryByRole('heading', { name: 'Programming Assignmnent' })).toBeNull();
    expect(screen.queryByText('Outline saved to this course.')).toBeNull();
  });
  it('supports course navigation through the small-screen selector', async () => {
    render(<App />);
    await screen.findByRole('button', { name: /Networks/ });
    fireEvent.change(screen.getByLabelText('View'), { target: { value: '1' } });
    await screen.findByRole('heading', { name: 'Networks' });
    fireEvent.change(screen.getByLabelText('View'), { target: { value: 'home' } });
    await screen.findByRole('heading', { name: 'Home' });
  });
  it('renders source text as text and blocks unsafe resource links', async () => {
    saved = structuredClone(result);
    saved.course.description = '<img src=x onerror="alert(1)">';
    saved.resources.push({ field: 'test', text: 'Unsafe source', links: [{ label: 'Bad link', url: 'javascript:alert(1)' }] });
    await openCourse();
    expect(document.querySelector('.course-dashboard img')).toBeNull();
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeTruthy();
    expect(screen.getByText('Bad link', { exact: false, selector: 'a' }).getAttribute('href')).toBeNull();
  });
  it('reloads planner items after import and shows managed lab details', async () => {
    await openCourse();
    vi.mocked(api.getItems).mockResolvedValue([{ id: '99', courseId: '1', outline_course_id: 1, title: 'Lab 1', recurrence: 'ONE_TIME',
      start_date: '2026-09-29T07:00:00Z', end_date: '2026-09-29T07:00:00Z', completed: false }]);
    loadOutline();
    await screen.findByText('Outline saved to this course.');
    const items = within(document.getElementById('course-items')!);
    fireEvent.click(await items.findByText('Lab 1'));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Managed by your course outline.')).toBeTruthy();
    expect(dialog.queryByRole('button', { name: /Edit/ })).toBeNull();
    expect(dialog.getByRole('button', { name: 'Mark as complete' })).toBeTruthy();
    expect(dialog.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });
  it('loads planner items created by automatic sync of an already saved outline', async () => {
    saved = structuredClone(result);
    vi.mocked(api.getItems).mockResolvedValueOnce([]).mockResolvedValue([{ id: '99', courseId: '1', outline_course_id: 1,
      title: 'Lab 1', recurrence: 'ONE_TIME', start_date: '2026-09-29T07:00:00Z', end_date: '2026-09-29T07:00:00Z' }]);
    await openCourse();
    await within(document.getElementById('course-items')!).findByText('Lab 1');
    expect(api.syncGroupOutline).toHaveBeenCalledWith('1', expect.any(AbortSignal));
    expect(api.saveGroupOutline).not.toHaveBeenCalled();
    expect(api.getItems).toHaveBeenCalledTimes(2);
  });

});
