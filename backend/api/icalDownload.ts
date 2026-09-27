import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import AppError from '../error/appError';
import { ERRORS } from '../error/errors';

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const invalidUrl = () => new AppError('The calendar link must use a public HTTP(S) destination without credentials', ERRORS.INVALID_ICAL_URL);
const downloadError = (message: string) => new AppError(message, ERRORS.ICAL_FETCH_FAILED);

export function normalizeICalUrl(url: string): string {
    if (typeof url !== 'string') throw invalidUrl();
    const raw = url.trim().replace(/^webcal:\/\//i, 'https://');
    let parsed: URL;
    try { parsed = new URL(raw); } catch { throw invalidUrl(); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw invalidUrl();
    parsed.hash = '';
    return parsed.toString();
}

function isPublicAddress(address: string): boolean {
    try {
        // process() converts IPv4-mapped IPv6 before classifying it.
        const parsed = ipaddr.process(address);
        // IPv6 space outside the global-unicast allocation is not a public destination,
        // even if the address library has no more specific classification for it.
        return parsed.range() === 'unicast' &&
            (parsed instanceof ipaddr.IPv4 || parsed.match(ipaddr.IPv6.parse('2000::'), 3));
    } catch {
        return false;
    }
}

async function pinnedLookup(url: URL): Promise<LookupFunction> {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = ipaddr.isValid(hostname)
        ? [{ address: hostname, family: ipaddr.parse(hostname).kind() === 'ipv4' ? 4 : 6 }]
        : await lookup(hostname, { all: true, verbatim: true });
    // Reject mixed public/private answers as well as literal private IPs.
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw invalidUrl();
    const pinned = addresses[0];
    return (_hostname, options, callback) => {
        // Node can request either one address or an array. Never perform a second DNS lookup.
        if (options.all) callback(null, [pinned]);
        else callback(null, pinned.address, pinned.family);
    };
}

type DownloadResponse = { body: string } | { redirect: string };

function requestCalendar(url: URL, lookupAddress: LookupFunction, signal: AbortSignal): Promise<DownloadResponse> {
    return new Promise((resolve, reject) => {
        const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
        // Keep the original hostname for Host/SNI/certificate validation. Disable pooling
        // so an existing socket cannot bypass this request's validated DNS destination.
        const req = transport(url, {
            lookup: lookupAddress,
            agent: false,
            signal,
            headers: { Accept: 'text/calendar', 'Accept-Encoding': 'identity' },
        }, (res) => {
            res.on('error', reject);
            const fail = (message: string) => {
                reject(downloadError(message));
                res.destroy();
                req.destroy();
            };
            const status = res.statusCode ?? 0;
            if (REDIRECTS.has(status)) {
                const location = res.headers.location;
                res.destroy();
                if (!location) reject(downloadError('The calendar link returned an invalid redirect'));
                else resolve({ redirect: location });
                return;
            }
            if (status < 200 || status >= 300) return fail(`The calendar link responded with ${status}`);
            const encoding = res.headers['content-encoding'];
            if (encoding && encoding.toLowerCase() !== 'identity') return fail('The calendar link returned unsupported compressed content');
            if (Number(res.headers['content-length']) > MAX_BYTES) return fail('The calendar exceeds the 5 MiB download limit');
            const chunks: Buffer[] = [];
            let size = 0;
            res.on('data', (chunk: Buffer) => {
                size += chunk.length;
                if (size > MAX_BYTES) return fail('The calendar exceeds the 5 MiB download limit');
                chunks.push(chunk);
            });
            res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8') }));
            res.on('aborted', () => reject(downloadError('The calendar download was interrupted')));
        });
        req.on('error', reject);
        req.end();
    });
}

/** A single deadline covers DNS resolution, every redirect, and the streamed body. */
export async function downloadCalendar(input: string): Promise<string> {
    const controller = new AbortController();
    const timeoutError = downloadError('The calendar download timed out');
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(timeoutError);
        }, TIMEOUT_MS);
    });
    const download = async () => {
        let target = new URL(normalizeICalUrl(input));
        for (let redirects = 0; ; redirects++) {
            const lookupAddress = await pinnedLookup(target);
            if (controller.signal.aborted) throw timeoutError;
            const response = await requestCalendar(target, lookupAddress, controller.signal);
            if ('body' in response) return response.body;
            if (redirects >= MAX_REDIRECTS) throw downloadError('The calendar link redirected too many times');
            target = new URL(normalizeICalUrl(new URL(response.redirect, target).toString()));
        }
    };
    try {
        return await Promise.race([download(), timeout]);
    } catch (error) {
        if (controller.signal.aborted) throw timeoutError;
        if (error instanceof AppError) throw error;
        // Network errors can contain private feed URLs; never expose their raw messages.
        throw downloadError('Could not download that calendar');
    } finally {
        clearTimeout(timer!);
    }
}
