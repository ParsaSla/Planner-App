import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fetchCourseOutline, parseOutlineResponse, parseOutlineUrl } from '../../backend/api/unswOutline';

const fixturePath = resolve('test/fixtures/unsw/comp9331-2026-t3.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const offering = parseOutlineUrl(fixture.sourceUrl);
const fresh = () => structuredClone(fixture.response);
const parse = (data = fresh()) => parseOutlineResponse(data, offering);
const labs = () => parse().assessments[1];

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('UNSW outline URL and identity', () => {
    it('reads and decodes all offering parameters from the URL fragment', () => {
        expect(offering).toEqual({ year: 2026, term: 'Term 3', deliveryMode: 'In Person', deliveryFormat: 'Standard',
            teachingPeriod: 'T3', deliveryLocation: 'Kensington', courseCode: 'COMP9331', activityGroupId: '1' });
    });
    it.each([
        'https://example.com/course-outlines/course-outline',
        fixture.sourceUrl.replace('https:', 'http:'),
        fixture.sourceUrl.replace('www.unsw.edu.au', 'www.unsw.edu.au.evil.example'),
        fixture.sourceUrl.replace('https://', 'https://user:pass@'),
        fixture.sourceUrl.replace('#', '?'),
        fixture.sourceUrl + '&year=2025',
        fixture.sourceUrl.replace('2026', 'not-a-year'),
        fixture.sourceUrl.replace('activityGroupId=1', 'activityGroupId=-1'),
    ])('rejects unsupported or ambiguous URL %s', url => {
        expect(() => parseOutlineUrl(url)).toThrow();
    });
    it.each(['integrat_coursecode', 'integrat_year', 'integrat_term', 'integrat_teachingperiod',
        'integrat_deliverymode', 'integrat_deliveryformat', 'integrat_location'])('rejects a mismatched %s', field => {
        const data = fresh(); data[field] = 'different';
        expect(() => parse(data)).toThrow(/does not match/);
    });
    it.each([null, [], 'not JSON', {}, { integrat_CO_Assessment: null }])('rejects invalid response shape', data => {
        expect(() => parse(data)).toThrow();
    });
    it('rejects malformed assessments', () => {
        const data = fresh(); data.integrat_CO_Assessment = [null];
        expect(() => parse(data)).toThrow(/assessment objects/);
        data.integrat_CO_Assessment = [{}];
        expect(() => parse(data)).toThrow(/no title/);
    });
});

describe('COMP9331 assessment extraction', () => {
    it('returns four groups and preserves original source data without mutating it', () => {
        const data = fresh(); const before = structuredClone(data);
        const result = parseOutlineResponse(data, offering, { retrievedAt: fixture.retrievedAt });
        expect(result.assessments).toHaveLength(4);
        expect(result.assessments.map(a => a.weightPercent)).toEqual([20, 20, 20, 40]);
        expect(result.course.name).toBe('Computer Networks and Applications');
        expect(result.provenance.rawResponse).toEqual(before);
        expect(result.provenance.retrievedAt).toBe(fixture.retrievedAt);
        expect(data).toEqual(before);
        expect(parse().provenance.retrievedAt).toBeNull();
    });
    it('converts the fixed assignment deadline with Sydney daylight saving', () => {
        expect(parse().assessments[0].deadlines[0]).toMatchObject({ kind: 'datetime', localDate: '2026-11-13',
            localTime: '17:00', timezone: 'Australia/Sydney', utc: '2026-11-13T06:00:00.000Z' });
    });
    it('extracts five separate labs using note evidence and does not multiply the weight', () => {
        const assessment = labs();
        expect(assessment.weightPercent).toBe(20);
        expect(assessment.deadlines.map(d => d.kind === 'datetime' ? d.utc : null)).toEqual([
            '2026-09-29T07:00:00.000Z', '2026-10-06T06:00:00.000Z', '2026-10-13T06:00:00.000Z',
            '2026-11-10T06:00:00.000Z', '2026-11-17T06:00:00.000Z',
        ]);
        for (const deadline of assessment.deadlines) {
            expect(deadline).not.toHaveProperty('weightPercent');
            expect(deadline.evidence.map(e => e.path)).toContain('integrat_CO_Assessment[1].integrat_submissionnotes');
            expect(deadline.assumptions).toHaveLength(2);
        }
    });
    it('keeps the midterm week separate from tentative schedule evidence', () => {
        const result = parse(); const midterm = result.assessments[2];
        expect(midterm.deadlines).toHaveLength(1);
        expect(midterm.deadlines[0]).toMatchObject({ kind: 'week-range', week: 7, rangeStart: '2026-10-26', rangeEnd: '2026-11-01' });
        expect(midterm.scheduleEvidence[0]).toMatchObject({ tentative: true, text: expect.stringContaining('Midterm Exam on 26th October') });
        expect(result.warnings.some(w => w.code === 'TENTATIVE_SCHEDULE')).toBe(true);
    });
    it('does not invent a final-exam date and retains its hurdle', () => {
        const final = parse().assessments[3];
        expect(final.deadlines[0].kind).toBe('exam-period');
        expect(final.deadlines[0]).not.toHaveProperty('localDate');
        expect(final.hurdleRules).toContain('40%');
    });
    it('extracts resources and staff and decodes HTML without scripts or unsafe links', () => {
        const data = fresh();
        data.integrat_expectedresources = '<p>A &amp; B&nbsp;notes</p><script>alert(1)</script><style>body{}</style><p><a href="/example">Reading</a> <a href="javascript:alert(1)">Unsafe</a></p>';
        const result = parse(data);
        const resource = result.resources.find(r => r.field === 'integrat_expectedresources')!;
        expect(resource.text).toBe('A & B notes\n\nReading Unsafe');
        expect(resource.links).toEqual([{ label: 'Reading', url: 'https://www.unsw.edu.au/example' }]);
        expect(result.resources.flatMap(r => r.links).some(l => l.url === 'https://gaia.cs.umass.edu/kurose_ross/index.php')).toBe(true);
        expect(result.contacts.some(c => c.name === 'Wen Hu' && c.position === 'Convenor')).toBe(true);
    });
});

describe('conservative deadline interpretation', () => {
    it.each(['31/02/2026 05:00 PM', '13/11/2026 13:00 PM', '13/11/2026 24:01',
        'Every Friday except the break', 'Week 7: 01 November - 26 October', ''])('retains unsupported or invalid date %s', value => {
        const data = fresh(); data.integrat_CO_Assessment[0].integrat_duedate = value;
        const result = parse(data);
        expect(result.assessments[0].deadlines[0].kind).toBe('unknown');
        expect(result.warnings.some(w => w.code === 'UNRESOLVED_DEADLINE')).toBe(true);
    });
    it('keeps date-only values as dates without midnight timestamps', () => {
        const data = fresh(); data.integrat_CO_Assessment[0].integrat_duedate = '13/11/2026';
        expect(parse(data).assessments[0].deadlines[0]).toMatchObject({ kind: 'date', localDate: '2026-11-13' });
        data.integrat_CO_Assessment[0].integrat_duedate = '13th November';
        expect(parse(data).assessments[0].deadlines[0]).toMatchObject({ kind: 'date', localDate: '2026-11-13' });
    });
    it('does not guess a lab time from arbitrary notes', () => {
        const data = fresh(); data.integrat_CO_Assessment[1].integrat_submissionnotes = 'See Moodle. Tutorial starts at 17:00.';
        const result = parse(data);
        expect(result.assessments[1].deadlines.every(d => d.kind === 'date')).toBe(true);
        expect(result.warnings.some(w => w.code === 'TIME_NOT_RESOLVED')).toBe(true);
    });
    it('flags conflicting weekday notes instead of inventing an exact deadline', () => {
        const data = fresh(); data.integrat_CO_Assessment[1].integrat_submissionnotes = '17:00 every Wednesday.';
        const result = parse(data);
        expect(result.assessments[1].deadlines.every(d => d.kind === 'unknown')).toBe(true);
        expect(result.warnings.some(w => w.code === 'CONFLICTING_SUBMISSION_DAY')).toBe(true);
    });
    it('retains valid labs even when another list entry is malformed', () => {
        const data = fresh(); data.integrat_CO_Assessment[1].integrat_duedate = 'Lab 1: Tue 29 September, Lab 2: TBA';
        expect(parse(data).assessments[1].deadlines.map(d => d.kind)).toEqual(['datetime', 'unknown']);
    });
    it('flags repeated lab labels and invalid weekday/date combinations', () => {
        const data = fresh(); data.integrat_CO_Assessment[1].integrat_duedate = 'Lab 1: Tue 29 September, Lab 1: Tue 6 October, Lab 3: Tue 14 October';
        expect(parse(data).assessments[1].deadlines.map(d => d.kind)).toEqual(['datetime', 'unknown', 'unknown']);
    });
    it.each(['04/10/2026 02:30 AM', '05/04/2026 02:30 AM'])('rejects nonexistent or ambiguous Sydney time %s', value => {
        const data = fresh(); data.integrat_CO_Assessment[0].integrat_duedate = value;
        expect(parse(data).assessments[0].deadlines[0].kind).toBe('unknown');
    });
    it('keeps local time without fabricating UTC for an unmapped campus', () => {
        const data = fresh(); data.integrat_location = 'Other campus';
        const result = parseOutlineResponse(data, { ...offering, deliveryLocation: 'Other campus' });
        expect(result.assessments[0].deadlines[0]).toMatchObject({ kind: 'datetime', timezone: null, utc: null });
        expect(result.warnings.some(w => w.code === 'TIMEZONE_UNKNOWN')).toBe(true);
    });
});

describe('public outline fetch', () => {
    it('constructs a fixed-origin request and records retrieval provenance', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fresh())));
        vi.stubGlobal('fetch', fetchMock);
        const result = await fetchCourseOutline(fixture.sourceUrl);
        const [url, options] = fetchMock.mock.calls[0];
        expect(new URL(url).origin).toBe('https://courseoutlines.unsw.edu.au');
        expect(new URL(url).searchParams.get('courseCode')).toBe('COMP9331');
        expect(options).toMatchObject({ redirect: 'error', credentials: 'omit' });
        expect(result.provenance.retrievedAt).toMatch(/^\d{4}-/);
    });
    it.each([
        [() => new Response('Not found', { status: 404 }), 'FETCH_FAILED'],
        [() => new Response('<html>error</html>'), 'INVALID_RESPONSE'],
        [() => new Response('{}', { headers: { 'content-length': String(6 * 1024 * 1024) } }), 'RESPONSE_TOO_LARGE'],
        [() => new Response('x'.repeat(5 * 1024 * 1024 + 1)), 'RESPONSE_TOO_LARGE'],
        [() => new Response(null), 'INVALID_RESPONSE'],
    ] as const)('reports fetch and payload errors', async (response, code) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
        await expect(fetchCourseOutline(fixture.sourceUrl)).rejects.toMatchObject({ code });
    });
    it('aborts a stalled request', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new Error('aborted')));
        })));
        const assertion = expect(fetchCourseOutline(fixture.sourceUrl)).rejects.toMatchObject({ code: 'FETCH_TIMEOUT' });
        await vi.advanceTimersByTimeAsync(10_000);
        await assertion;
    });
});

describe('standalone inspection command', () => {
    it('produces machine-readable JSON from the offline fixture', () => {
        const output = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/inspectUnswOutline.ts', '--fixture', fixturePath, '--json'], { encoding: 'utf8' });
        const result = JSON.parse(output);
        expect(result.assessments).toHaveLength(4);
        expect(result.assessments[1].deadlines).toHaveLength(5);
        expect(result.provenance.retrievedAt).toBe(fixture.retrievedAt);
    });
    it('exits unsuccessfully on invalid usage', () => {
        const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/inspectUnswOutline.ts'], { encoding: 'utf8' });
        expect(child.status).toBe(1);
        expect(child.stderr).toContain('exactly one');
    });
});
