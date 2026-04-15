import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { govFetch } from './fetch-utils';
import type { IREPSTenderRaw, IREPSZone } from './types';

export const IREPS_BASE = 'https://www.ireps.gov.in';
export const IREPS_GUEST_LOGIN_PATH = '/epsn/guestLogin.do';
export const IREPS_CAPTCHA_PATH = '/epsn/generateCaptchaAction.do';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * 17 railway zones + a few production units.
 * Used as a stable fallback if the post-login landing page can't be parsed.
 * The `id` is the human-readable code; the actual scrape-zone request finds
 * the matching row in the IREPS landing page by name.
 */
export const IREPS_ZONES: IREPSZone[] = [
  { id: 'CR', name: 'Central Railway' },
  { id: 'ER', name: 'Eastern Railway' },
  { id: 'ECR', name: 'East Central Railway' },
  { id: 'ECoR', name: 'East Coast Railway' },
  { id: 'NR', name: 'Northern Railway' },
  { id: 'NCR', name: 'North Central Railway' },
  { id: 'NER', name: 'North Eastern Railway' },
  { id: 'NFR', name: 'Northeast Frontier Railway' },
  { id: 'NWR', name: 'North Western Railway' },
  { id: 'SR', name: 'Southern Railway' },
  { id: 'SCR', name: 'South Central Railway' },
  { id: 'SER', name: 'South Eastern Railway' },
  { id: 'SECR', name: 'South East Central Railway' },
  { id: 'SWR', name: 'South Western Railway' },
  { id: 'WR', name: 'Western Railway' },
  { id: 'WCR', name: 'West Central Railway' },
  { id: 'KMRC', name: 'Metro Railway Kolkata' },
];

export interface IREPSInitResult {
  jar: CookieJar;
  jsessionid: string;
  strutsToken: string;
  /** Form action URL with embedded jsessionid (Struts pattern). */
  formAction: string;
  /** Captcha challenge image as base64 PNG/JPG (no `data:` prefix). */
  captchaImage: string;
  /** Captcha audio (base64 WAV) for accessibility. */
  captchaAudio: string;
  /** The captcha "ver" token to send back with the OTP submission. */
  captchaVer: string;
}

/**
 * Step 1 of IREPS auth: load the guest login page, extract Struts CSRF token
 * and JSESSIONID, then fetch a captcha challenge for the user to solve.
 */
export async function initIREPSSession(): Promise<IREPSInitResult> {
  const jar = new CookieJar();
  const res = await govFetch(IREPS_BASE + IREPS_GUEST_LOGIN_PATH, {
    jar,
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) {
    throw new Error(`IREPS guest login page returned HTTP ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const strutsToken = $('input[name="org.apache.struts.taglib.html.TOKEN"]').attr('value');
  if (!strutsToken) {
    throw new Error('Could not extract Struts CSRF token from IREPS login page');
  }

  // Form action carries the jsessionid: /epsn/guestLogin.do;jsessionid=XXX
  const formAction = $('form').first().attr('action') ?? '';
  const jsessionid =
    extractJsessionid(formAction) ?? (await extractJsessionidFromJar(jar)) ?? '';
  if (!jsessionid) {
    throw new Error('Could not extract JSESSIONID from IREPS login page');
  }

  // Fetch the captcha challenge using the same session.
  const captchaRes = await govFetch(IREPS_BASE + IREPS_CAPTCHA_PATH, {
    jar,
    method: 'POST',
    headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!captchaRes.ok) {
    throw new Error(`IREPS captcha endpoint returned HTTP ${captchaRes.status}`);
  }
  const captcha = (await captchaRes.json()) as {
    imageCaptcha: string;
    audioCaptcha: string;
    newcaptcha: string;
  };

  return {
    jar,
    jsessionid,
    strutsToken,
    formAction: formAction.startsWith('/') ? formAction : `/epsn/guestLogin.do;jsessionid=${jsessionid}`,
    captchaImage: captcha.imageCaptcha,
    captchaAudio: captcha.audioCaptcha,
    captchaVer: captcha.newcaptcha,
  };
}

export interface IREPSSubmitInput {
  jar: CookieJar;
  jsessionid: string;
  strutsToken: string;
  formAction: string;
  captchaVer: string;
  /** The captcha solution the user typed (matching the displayed image). */
  captchaInput: string;
  mobileNumber: string;
  countryCode?: string;
  otp: string;
}

export interface IREPSSubmitResult {
  authenticated: boolean;
  /** Server-rendered error message if authentication failed. */
  errorMessage?: string;
  /** The post-auth HTML so callers can pre-parse zones in the same call. */
  landingHtml?: string;
}

/**
 * Step 2: submit the Struts form with mobile + OTP + captcha. On success the
 * server typically 302-redirects to the search landing page; we follow that
 * and use the response body to detect auth state ("Logout" link, absence of
 * the login form, etc.).
 */
export async function submitIREPSOtp(input: IREPSSubmitInput): Promise<IREPSSubmitResult> {
  const body = new URLSearchParams({
    'org.apache.struts.taglib.html.TOKEN': input.strutsToken,
    activity: 'submitOTP',
    actionMode: 'adSearch',
    number: input.captchaInput, // captcha solution (form field is "number")
    otp: input.otp,
    mobileNo: input.mobileNumber,
    ccode: input.countryCode ?? '91',
    guForm: '',
    ver: input.captchaVer,
    imageField: 'Proceed',
  });

  const url = input.formAction.startsWith('http')
    ? input.formAction
    : IREPS_BASE + input.formAction;

  const res = await govFetch(url, {
    jar: input.jar,
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: IREPS_BASE,
      Referer: IREPS_BASE + IREPS_GUEST_LOGIN_PATH,
    },
    body: body.toString(),
    redirect: 'follow',
  });

  const html = await res.text();
  const lower = html.toLowerCase();

  // Heuristic auth-success detection. If we still see the OTP form on the
  // returned page, login was rejected. If we see "logout" or the search
  // landing markers, we're in.
  const stillOnLogin =
    lower.includes("please enter today's otp") || lower.includes('please enter today&#39;s otp');
  const seeLogout = lower.includes('logout');
  const authenticated = !stillOnLogin && (seeLogout || res.url.includes('anonymSearch'));

  let errorMessage: string | undefined;
  if (!authenticated) {
    const $ = cheerio.load(html);
    // Common Struts/IREPS error placement: <ul class="errorMessage"> or
    // <font color=red>... or alert spans.
    const candidates = [
      $('ul.errorMessage li').first().text().trim(),
      $('font[color="red"], font[color="#ff0000"]').first().text().trim(),
      $('.alert-danger, .errorMsg, #errorMsg').first().text().trim(),
    ].filter(Boolean);
    errorMessage = candidates[0] || 'Authentication failed (invalid captcha or OTP, or session expired)';
  }

  return { authenticated, errorMessage, landingHtml: authenticated ? html : undefined };
}

/**
 * Parse the post-auth landing page for available zones.
 * IREPS may render zones in a table or as anchor links — try both.
 * Falls back to the static IREPS_ZONES list if nothing is parsed.
 */
export function parseIREPSZones(html: string): IREPSZone[] {
  const $ = cheerio.load(html);
  const found: IREPSZone[] = [];

  // Pattern A: <table> with zone name in one column + an anchor in another.
  $('table').each((_, t) => {
    const $t = $(t);
    const headers = $t.find('tr').first().find('th, td')
      .map((_i, el) => $(el).text().trim().toLowerCase())
      .get();
    const looksRight = headers.some((h) => h.includes('railway') || h.includes('zone'));
    if (!looksRight) return;
    $t.find('tr').slice(1).each((_i, row) => {
      const cells = $(row).find('td');
      if (cells.length === 0) return;
      const name = cells.map((_j, c) => $(c).text().trim()).get().find((s) => /railway|metro|production/i.test(s));
      if (!name) return;
      const id = name.replace(/\s+/g, '_').toUpperCase().slice(0, 12);
      found.push({ id, name });
    });
  });

  // Deduplicate by name and merge with the static list (canonical display order).
  const seen = new Set(found.map((z) => z.name.toLowerCase()));
  const merged = [
    ...IREPS_ZONES.filter((z) => seen.size === 0 || seen.has(z.name.toLowerCase())),
    ...found.filter((z) => !IREPS_ZONES.some((s) => s.name.toLowerCase() === z.name.toLowerCase())),
  ];
  return merged.length > 0 ? merged : IREPS_ZONES;
}

/**
 * Stub for one zone's tender list. The exact URL/parameters depend on the
 * post-auth JS routing (see 02_IREPS_TECHNICAL_RESEARCH.md). We pass the
 * cookie jar with the authenticated JSESSIONID through and parse defensively.
 */
export async function scrapeIREPSZone(
  jar: CookieJar,
  zone: IREPSZone
): Promise<IREPSTenderRaw[]> {
  // The doc's anonymSearch.do path is the post-login search entrypoint.
  // Callers may iterate zone-by-zone using a query param like `rly={zone.id}`
  // — we pass through and parse whatever the server returns.
  const url = `${IREPS_BASE}/epsn/anonymSearch.do?searchParam=showPage&language=en&rly=${encodeURIComponent(
    zone.id
  )}`;
  const res = await govFetch(url, { jar, headers: { 'User-Agent': UA } });
  if (!res.ok) {
    throw new Error(`IREPS zone fetch (${zone.name}) returned HTTP ${res.status}`);
  }
  const html = await res.text();
  return parseIREPSTenderTable(html, zone);
}

export function parseIREPSTenderTable(html: string, zone: IREPSZone): IREPSTenderRaw[] {
  const $ = cheerio.load(html);
  const out: IREPSTenderRaw[] = [];

  // Identify the tender table by its header row. IREPS column order has
  // historically varied across zones, so identify columns by header text.
  $('table').each((_, t) => {
    const $t = $(t);
    const headers = $t.find('tr').first().find('th, td')
      .map((_i, el) => $(el).text().trim().toLowerCase())
      .get();
    if (headers.length < 4) return;
    const looksRight =
      headers.some((h) => h.includes('tender')) &&
      headers.some((h) => h.includes('closing') || h.includes('due'));
    if (!looksRight) return;

    const col = (needle: string) => headers.findIndex((h) => h.includes(needle));
    const iTitle = col('description') >= 0 ? col('description') : col('tender');
    const iRef = col('tender no') >= 0 ? col('tender no') : col('reference');
    const iDept = col('department');
    const iDiv = col('division');
    const iValue = col('value') >= 0 ? col('value') : col('estimat');
    const iPub = col('published') >= 0 ? col('published') : col('opening');
    const iClose = col('closing') >= 0 ? col('closing') : col('due');
    const iType = col('tender type') >= 0 ? col('tender type') : col('type');

    const rows = $t.children('tbody').length
      ? $t.children('tbody').children('tr')
      : $t.children('tr');

    rows.slice(1).each((_i, row) => {
      const cells = $(row).children('td');
      if (cells.length < 4) return;
      const get = (idx: number) => (idx >= 0 ? $(cells[idx]).text().replace(/\s+/g, ' ').trim() : '');
      const title = get(iTitle);
      const refNo = get(iRef);
      if (!title && !refNo) return;
      const detailLink = iTitle >= 0 ? $(cells[iTitle]).find('a').attr('href') ?? '' : '';
      out.push({
        tenderId: refNo || title.slice(0, 60),
        title: title || refNo,
        referenceNo: refNo,
        department: get(iDept) || 'Unknown',
        zone: zone.name,
        division: get(iDiv) || undefined,
        estimatedValue: get(iValue) || undefined,
        publishedDate: get(iPub),
        closingDate: get(iClose),
        tenderType: get(iType) || undefined,
        detailLink: detailLink ? (detailLink.startsWith('http') ? detailLink : IREPS_BASE + detailLink) : undefined,
        source: 'IREPS',
      });
    });
  });

  return out;
}

function extractJsessionid(s: string): string | null {
  const m = /jsessionid=([^?;&]+)/i.exec(s);
  return m ? m[1] : null;
}

async function extractJsessionidFromJar(jar: CookieJar): Promise<string | null> {
  const cookies = await jar.getCookies(IREPS_BASE);
  const c = cookies.find((c) => c.key.toUpperCase() === 'JSESSIONID');
  return c?.value ?? null;
}
