import https from 'node:https';
import { CookieJar } from 'tough-cookie';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const govAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

function isGovHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.endsWith('.gov.in') || host.endsWith('.nic.in');
  } catch {
    return false;
  }
}

export interface GovFetchOptions extends RequestInit {
  jar?: CookieJar;
  timeoutMs?: number;
  retries?: number;
  retryBaseMs?: number;
}

/**
 * Fetch helper for Indian government sites.
 * - Accepts NIC self-signed/non-standard certs for *.gov.in / *.nic.in hosts.
 * - Optional CookieJar for session-bound sequences (CPPP).
 * - Retries with exponential backoff on transient failures.
 */
export async function govFetch(url: string, options: GovFetchOptions = {}): Promise<Response> {
  const {
    jar,
    timeoutMs = 20_000,
    retries = 3,
    retryBaseMs = 750,
    headers: inHeaders,
    ...rest
  } = options;

  const headers = new Headers(inHeaders);
  if (!headers.has('User-Agent')) headers.set('User-Agent', DEFAULT_UA);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  }
  if (!headers.has('Accept-Language')) headers.set('Accept-Language', 'en-US,en;q=0.9');

  if (jar) {
    const cookieHeader = await jar.getCookieString(url);
    if (cookieHeader) headers.set('Cookie', cookieHeader);
  }

  const nodeOpts: RequestInit & { agent?: https.Agent } = { ...rest, headers };
  if (isGovHost(url)) {
    // Node fetch (undici) honors `dispatcher`, but on Vercel/Node the per-request
    // `agent` option is respected via the internal adapter. Fall back to the env
    // var NODE_TLS_REJECT_UNAUTHORIZED=0 for .gov.in if this is ignored.
    (nodeOpts as { agent?: https.Agent }).agent = govAgent;
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...nodeOpts, signal: controller.signal });

      if (jar) {
        const setCookies = res.headers.getSetCookie?.() ?? [];
        for (const c of setCookies) {
          await jar.setCookie(c, url).catch(() => void 0);
        }
      }

      if (res.status >= 500 && attempt < retries) {
        await sleep(retryBaseMs * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) break;
      await sleep(retryBaseMs * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function serializeJar(jar: CookieJar): Promise<string> {
  return JSON.stringify(await jar.serialize());
}

export async function deserializeJar(serialized: string): Promise<CookieJar> {
  return CookieJar.deserialize(JSON.parse(serialized));
}
