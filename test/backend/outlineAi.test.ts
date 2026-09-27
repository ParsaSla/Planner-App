import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractOutlineCandidates, parseAiSuggestions } from '../../backend/api/outlineAi';
import { parseOutlineResponse, parseOutlineUrl } from '../../backend/api/unswOutline';
import fixture from '../fixtures/unsw/comp9331-2026-t3.json';

const outline = parseOutlineResponse(fixture.response, parseOutlineUrl(fixture.sourceUrl));
const validSuggestion = {
    candidates: [{ assessmentKey: 'assessment-1', label: 'Programming assignment', raw: '13/11/2026 05:00 PM',
        localDate: '2026-11-13', localTime: '17:00', evidence: [{ field: 'deadline.0.raw', text: '13/11/2026 05:00 PM' }] }],
};

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('AI outline suggestions', () => {
    it('accepts only dated candidates backed by exact source quotes', () => {
        const candidates = parseAiSuggestions(validSuggestion, outline);
        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({ source: 'ai', selected: false, assessmentKey: 'assessment-1',
            deadline: { kind: 'datetime', localDate: '2026-11-13', localTime: '17:00', timezone: 'Australia/Sydney', utc: '2026-11-13T06:00:00.000Z' } });
        expect(parseAiSuggestions({ candidates: [{ ...validSuggestion.candidates[0], localDate: '2026-02-30' }] }, outline)).toEqual([]);
        expect(parseAiSuggestions({ candidates: [{ ...validSuggestion.candidates[0], evidence: [{ field: 'deadline.0.raw', text: 'invented quote' }] }] }, outline)).toEqual([]);
    });

    it('extracts an explicit weekly lab pattern without inventing the occurrence range', () => {
        const source = 'Start Date 10:00 AM, each Tuesday. Due Date 10:00 AM, the following Tuesday.';
        const courseOutline = structuredClone(outline);
        courseOutline.assessments[0].submissionNotes = source;
        const candidates = parseAiSuggestions({ candidates: [{ assessmentKey: 'assessment-1', label: 'Labs', raw: source,
            evidence: [{ field: 'submissionNotes', text: source }], weeklySeries: {
                weekday: 'TUESDAY', releaseTime: '10:00', dueTime: '10:00', dueOffsetDays: 7,
            } }] }, courseOutline);
        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({ source: 'ai', selected: false, weeklySeries: {
            weekday: 'TUESDAY', releaseTime: '10:00', dueTime: '10:00', dueOffsetDays: 7,
            firstReleaseDate: null, lastReleaseDate: null, timezone: 'Australia/Sydney',
        } });
    });

    it('does not call a provider when no key is configured', async () => {
        vi.stubEnv('OPENROUTER_API_KEY', '');
        const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
        await expect(extractOutlineCandidates(outline)).resolves.toMatchObject({ status: 'unavailable', candidates: [] });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('bounds provider requests and validates structured model output', async () => {
        vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
        const rawOutput = JSON.stringify(validSuggestion);
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'provider/test-model', choices: [{ message: { content: rawOutput } }] })));
        vi.stubGlobal('fetch', fetchMock);
        await expect(extractOutlineCandidates(outline)).resolves.toMatchObject({ status: 'ready', model: 'provider/test-model',
            rawOutput, reportedCandidates: 1, candidates: [{ source: 'ai' }] });
        expect(fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.objectContaining({
            redirect: 'error', credentials: 'omit', signal: expect.any(AbortSignal),
        }));
        expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer test-key' });
    });

    it('fails closed on invalid provider responses', async () => {
        vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json')));
        await expect(extractOutlineCandidates(outline)).resolves.toMatchObject({ status: 'failed', candidates: [] });
    });

    it('reports provider HTTP errors while redacting credential-shaped text', async () => {
        vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
            message: 'Invalid key sk-or-v1-should-not-appear; Bearer another-secret',
        } }), { status: 401 })));
        await expect(extractOutlineCandidates(outline)).resolves.toMatchObject({
            status: 'failed', message: 'OpenRouter returned HTTP 401: Invalid key [redacted key]; Bearer [redacted]',
        });
    });

    it('rejects oversized provider responses', async () => {
        vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { headers: { 'content-length': String(600 * 1024) } })));
        await expect(extractOutlineCandidates(outline)).resolves.toMatchObject({ status: 'failed', candidates: [] });
    });

    it('aborts stalled provider requests at the timeout', async () => {
        vi.useFakeTimers();
        vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
        vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new Error('aborted')));
        })));
        const assertion = expect(extractOutlineCandidates(outline)).resolves.toMatchObject({ status: 'failed', message: 'OpenRouter request timed out.' });
        await vi.advanceTimersByTimeAsync(20_000);
        await assertion;
    });
});