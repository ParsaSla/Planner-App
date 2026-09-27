import { DateTime } from 'luxon';
import type { OutlineImportCandidate, OutlineResult, OutlineWeeklySeries } from '../../shared/outline';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openrouter/free';
const TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_DEBUG_OUTPUT_CHARS = 12_000;
const MAX_CANDIDATES = 100;
const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

interface SourceField { assessmentKey: string; field: string; text: string }

export interface AiExtractionResult {
    status: 'ready' | 'unavailable' | 'failed';
    message: string | null;
    model: string | null;
    rawOutput: string | null;
    reportedCandidates: number;
    candidates: OutlineImportCandidate[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown, maxLength: number): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isTime(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
    const [hour, minute] = value.split(':').map(Number);
    return hour <= 23 && minute <= 59;
}

function sourceFields(outline: OutlineResult): SourceField[] {
    const fields: SourceField[] = [];
    for (const assessment of outline.assessments) {
        for (const [field, text] of [
            ['description', assessment.description], ['submissionNotes', assessment.submissionNotes],
            ['hurdleRules', assessment.hurdleRules], ['additionalInformation', assessment.additionalInformation],
        ] as const) {
            if (text) fields.push({ assessmentKey: assessment.key, field, text });
        }
        assessment.deadlines.forEach((deadline, index) => {
            if (deadline.raw) fields.push({ assessmentKey: assessment.key, field: `deadline.${index}.raw`, text: deadline.raw });
            deadline.evidence.forEach((evidence, evidenceIndex) => {
                if (evidence.text) fields.push({ assessmentKey: assessment.key, field: `deadline.${index}.evidence.${evidenceIndex}`, text: evidence.text });
            });
        });
        assessment.scheduleEvidence.forEach((evidence, index) => {
            fields.push({ assessmentKey: assessment.key, field: `scheduleEvidence.${index}`, text: evidence.text });
        });
    }
    return fields;
}

function validateSuggestions(value: unknown, outline: OutlineResult, fields: SourceField[]): OutlineImportCandidate[] {
    if (!isRecord(value) || !Array.isArray(value.candidates) || value.candidates.length > MAX_CANDIDATES) return [];
    const assessmentKeys = new Set(outline.assessments.map(assessment => assessment.key));
    const allowedFields = new Map(fields.map(field => [`${field.assessmentKey}\u0000${field.field}`, field.text]));
    const candidates: OutlineImportCandidate[] = [];
    for (const candidate of value.candidates) {
        if (!isRecord(candidate) || !isString(candidate.assessmentKey, 120) || !assessmentKeys.has(candidate.assessmentKey) ||
            !isString(candidate.label, 200) || !isString(candidate.raw, 500) ||
            !Array.isArray(candidate.evidence) || candidate.evidence.length === 0 || candidate.evidence.length > 4) continue;
        const evidence = candidate.evidence.flatMap(entry => {
            if (!isRecord(entry) || !isString(entry.field, 120) || !isString(entry.text, 500)) return [];
            const source = allowedFields.get(`${candidate.assessmentKey}\u0000${entry.field}`);
            if (!source || !source.includes(entry.text) || !String(candidate.raw).includes(entry.text)) return [];
            return [{ path: `assessment.${candidate.assessmentKey}.${entry.field}`, text: entry.text }];
        });
        if (evidence.length === 0) continue;
        const assessment = outline.assessments.find(item => item.key === candidate.assessmentKey)!;
        if (candidate.weeklySeries !== undefined) {
            if (!isRecord(candidate.weeklySeries) || !WEEKDAYS.includes(candidate.weeklySeries.weekday as typeof WEEKDAYS[number]) ||
                !isTime(candidate.weeklySeries.releaseTime) || !isTime(candidate.weeklySeries.dueTime) ||
                !Number.isInteger(candidate.weeklySeries.dueOffsetDays) || Number(candidate.weeklySeries.dueOffsetDays) < 1 || Number(candidate.weeklySeries.dueOffsetDays) > 14) continue;
            const timezone = assessment.deadlines.find(item => item.kind === 'datetime')?.timezone ?? outline.course.timezone;
            const weeklySeries: OutlineWeeklySeries = {
                weekday: candidate.weeklySeries.weekday as OutlineWeeklySeries['weekday'],
                releaseTime: candidate.weeklySeries.releaseTime,
                dueTime: candidate.weeklySeries.dueTime,
                dueOffsetDays: Number(candidate.weeklySeries.dueOffsetDays),
                firstReleaseDate: null,
                lastReleaseDate: null,
                timezone,
            };
            candidates.push({ id: `ai-series-${candidate.assessmentKey}-${candidates.length + 1}`, assessmentKey: candidate.assessmentKey,
                deadline: { kind: 'unknown', label: candidate.label.trim(), raw: candidate.raw.trim(), evidence, assumptions: [] },
                source: 'ai', selected: false, weeklySeries });
            continue;
        }
        if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(candidate.localDate))) continue;
        const date = DateTime.fromISO(candidate.localDate as string, { zone: 'UTC' });
        if (!date.isValid || date.toISODate() !== candidate.localDate) continue;
        const time = candidate.localTime;
        let deadline: OutlineImportCandidate['deadline'];
        if (time === null) {
            deadline = { kind: 'date', label: candidate.label.trim(), raw: candidate.raw.trim(), localDate: candidate.localDate as string,
                evidence, assumptions: [] };
        } else {
            if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) continue;
            const timezone = assessment.deadlines.find(item => item.kind === 'datetime')?.timezone ?? outline.course.timezone;
            if (!timezone) continue;
            const local = DateTime.fromISO(`${candidate.localDate}T${time}`, { zone: timezone });
            if (!local.isValid || local.toFormat('HH:mm') !== time || local.getPossibleOffsets().length !== 1) continue;
            deadline = { kind: 'datetime', label: candidate.label.trim(), raw: candidate.raw.trim(), localDate: candidate.localDate as string,
                localTime: time, timezone, utc: local.toUTC().toISO(), evidence, assumptions: [] };
        }
        candidates.push({ id: `ai-${candidate.assessmentKey}-${candidates.length + 1}`, assessmentKey: candidate.assessmentKey,
            deadline, source: 'ai', selected: false });
    }
    return candidates;
}

export function parseAiSuggestions(value: unknown, outline: OutlineResult): OutlineImportCandidate[] {
    return validateSuggestions(value, outline, sourceFields(outline));
}

async function readBoundedJson(response: Response): Promise<unknown> {
    if (!response.body) return null;
    if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > MAX_RESPONSE_BYTES) return null;
        chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
    catch { return null; }
}

function providerErrorMessage(value: unknown): string | null {
    if (!isRecord(value)) return null;
    const error = value.error;
    const message = typeof error === 'string' ? error : isRecord(error) ? error.message : null;
    if (typeof message !== 'string' || !message.trim()) return null;
    return message.trim().slice(0, 500)
        .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/\bsk-or-v1-[A-Za-z0-9_-]+\b/g, '[redacted key]');
}

export async function extractOutlineCandidates(outline: OutlineResult): Promise<AiExtractionResult> {
    const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return { status: 'unavailable', message: 'AI suggestions are unavailable because no OpenRouter key is configured.',
        model, rawOutput: null, reportedCandidates: 0, candidates: [] };

    const failed = (message: string, rawOutput: string | null = null): AiExtractionResult => ({
        status: 'failed', message, model, rawOutput, reportedCandidates: 0, candidates: [],
    });

    const fields = sourceFields(outline);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(OPENROUTER_ENDPOINT, {
            method: 'POST', signal: controller.signal, redirect: 'error', credentials: 'omit',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                model,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: 'Extract assessment deadlines explicitly supported by the supplied course outline snippets. Return JSON with a candidates array. One-off candidate fields: assessmentKey, label, raw (including the exact evidence quote), localDate (YYYY-MM-DD), localTime (HH:mm or null), evidence [{field,text}] copied verbatim from one supplied snippet. For explicit recurring schedules, use weeklySeries instead of localDate: {weekday, releaseTime, dueTime, dueOffsetDays}; weekday is uppercase English weekday, times are HH:mm, and dueOffsetDays is the explicit day interval. Report only weekdays, times, and intervals expressly stated in the source. Never infer a year, first/last occurrence date, time, timezone, or date. Leave ranges unresolved unless explicit dates are supplied; exclude tentative schedule dates.' },
                    { role: 'user', content: JSON.stringify({ course: { code: outline.course.courseCode, year: outline.course.year,
                        timezone: outline.course.timezone }, assessments: outline.assessments.map(assessment => ({
                        assessmentKey: assessment.key, title: assessment.title,
                        snippets: fields.filter(field => field.assessmentKey === assessment.key).map(({ field, text }) => ({ field, text })),
                    })) }) },
                ],
            }),
        });
        if (!response.ok) {
            const errorBody = await readBoundedJson(response);
            const details = providerErrorMessage(errorBody);
            return failed(`OpenRouter returned HTTP ${response.status}${details ? `: ${details}` : '.'}`);
        }
        const body = await readBoundedJson(response);
        const content = isRecord(body) && Array.isArray(body.choices) && isRecord(body.choices[0]) && isRecord(body.choices[0].message)
            ? body.choices[0].message.content : null;
        if (typeof content !== 'string') return failed('OpenRouter returned an unsupported response.');
        const responseModel = isRecord(body) && isString(body.model, 200) ? body.model : model;
        const rawOutput = content.length > MAX_DEBUG_OUTPUT_CHARS
            ? `${content.slice(0, MAX_DEBUG_OUTPUT_CHARS)}\n[Output truncated for diagnostics.]` : content;
        let parsed: unknown;
        try { parsed = JSON.parse(content) as unknown; } catch { return failed('OpenRouter returned invalid structured output.', rawOutput); }
        const reportedCandidates = isRecord(parsed) && Array.isArray(parsed.candidates) ? parsed.candidates.length : 0;
        return { status: 'ready', message: null, model: responseModel, rawOutput, reportedCandidates,
            candidates: validateSuggestions(parsed, outline, fields) };
    } catch {
        return failed(controller.signal.aborted ? 'OpenRouter request timed out.' : 'OpenRouter is unavailable.');
    } finally {
        clearTimeout(timer);
        controller.abort();
    }
}