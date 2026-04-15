import * as cheerio from 'cheerio';
import { parse as parseDate } from 'date-fns';
import { CookieJar } from 'tough-cookie';
import type { CPPPOrg, CPPPTenderRaw } from './types';
import { govFetch } from './fetch-utils';

export const CPPP_BASE = 'https://etenders.gov.in';
export const CPPP_ORG_LIST_URL =
  'https://etenders.gov.in/eprocure/app?page=FrontEndTendersByOrganisation&service=page';

const ORG_HEADER_SIGNATURE = ['s.no', 'organisation name', 'tender count'];
const TENDER_HEADER_TOKENS = [
  's.no',
  'e-published date',
  'closing date',
  'opening date',
  'title and ref.no./tender id',
  'organisation chain',
];

export interface OrgListingResult {
  orgs: CPPPOrg[];
  totalTenders: number;
  jar: CookieJar;
}

export async function fetchOrgListing(jar?: CookieJar): Promise<OrgListingResult> {
  const cookieJar = jar ?? new CookieJar();
  const res = await govFetch(CPPP_ORG_LIST_URL, { jar: cookieJar });

  if (!res.ok) {
    throw new Error(`CPPP org listing returned HTTP ${res.status}`);
  }
  const html = await res.text();
  const orgs = parseOrgListing(html);
  if (orgs.length === 0) {
    throw new Error('CPPP org listing parsed 0 orgs — page structure may have changed');
  }
  const totalTenders = orgs.reduce((sum, o) => sum + (o.count || 0), 0);
  return { orgs, totalTenders, jar: cookieJar };
}

export function parseOrgListing(html: string): CPPPOrg[] {
  const $ = cheerio.load(html);
  const orgs: CPPPOrg[] = [];

  $('table').each((_, table) => {
    const $table = $(table);
    const firstRow = $table.find('tr').first();
    const headers = firstRow
      .find('td, th')
      .map((__, el) => $(el).text().trim().toLowerCase())
      .get();

    const matches =
      headers.length >= 3 &&
      ORG_HEADER_SIGNATURE.every((h, i) => headers[i]?.includes(h.split(' ')[0] ?? ''));

    if (!matches) return;

    $table
      .find('tr')
      .slice(1)
      .each((__, row) => {
        const cells = $(row).find('td');
        if (cells.length < 3) return;
        const sno = $(cells[0]).text().trim();
        const name = $(cells[1]).text().trim();
        const countText = $(cells[2]).text().trim();
        const link = $(cells[2]).find('a').attr('href') || '';
        if (!/^\d+$/.test(sno) || !link) return;
        orgs.push({
          sno: parseInt(sno, 10),
          name,
          count: parseInt(countText, 10) || 0,
          link,
        });
      });
  });

  return orgs;
}

export interface ScrapeOrgResult {
  tenders: CPPPTenderRaw[];
  jar: CookieJar;
}

export async function fetchOrgTenders(
  org: Pick<CPPPOrg, 'name' | 'link'>,
  jar: CookieJar
): Promise<ScrapeOrgResult> {
  const url = org.link.startsWith('http') ? org.link : `${CPPP_BASE}${org.link}`;
  const res = await govFetch(url, { jar });
  if (!res.ok) {
    throw new Error(`CPPP org ${org.name} returned HTTP ${res.status}`);
  }
  const html = await res.text();
  const tenders = parseTenderTable(html, org.name);
  return { tenders, jar };
}

export function parseTenderTable(html: string, orgName: string): CPPPTenderRaw[] {
  const $ = cheerio.load(html);
  const out: CPPPTenderRaw[] = [];

  // Find every table whose first row matches the tender header signature, then
  // keep only the innermost (nested tables share the header row of their parent).
  const candidates: cheerio.Cheerio<never>[] = [];
  $('table').each((_, table) => {
    const $table = $(table);
    const firstRow = $table.find('tr').first();
    const headers = firstRow
      .find('td, th')
      .map((__, el) => $(el).text().trim().toLowerCase())
      .get();
    if (headers.length < 5) return;
    const matched = TENDER_HEADER_TOKENS.every((needle) =>
      headers.some((h) => h.includes(needle))
    );
    if (matched) candidates.push($table as unknown as cheerio.Cheerio<never>);
  });

  const innermost = candidates.filter(($t) => {
    // Keep $t only if it doesn't contain another matching table.
    return !candidates.some(($other) => $other !== $t && $t.find($other as never).length > 0);
  });

  innermost.forEach(($table) => {
    const firstRow = $table.find('tr').first();
    const headers = firstRow
      .find('td, th')
      .map((__, el) => $(el).text().trim().toLowerCase())
      .get();

    const colIndex = (needle: string) => headers.findIndex((h) => h.includes(needle));
    const iPub = colIndex('e-published');
    const iClose = colIndex('closing');
    const iOpen = colIndex('opening');
    const iTitle = colIndex('title and ref');
    const iChain = colIndex('organisation chain');

    // Only iterate direct-child rows so we don't descend into nested tables.
    const rows = $table.children('tbody').length
      ? $table.children('tbody').children('tr')
      : $table.children('tr');

    rows.slice(1).each((__, row) => {
      const cells = $(row).children('td');
      if (cells.length < 5) return;

      const publishedDate = iPub >= 0 ? $(cells[iPub]).text().trim() : '';
      const closingDate = iClose >= 0 ? $(cells[iClose]).text().trim() : '';
      const openingDate = iOpen >= 0 ? $(cells[iOpen]).text().trim() : '';
      const titleCellText = iTitle >= 0 ? $(cells[iTitle]).text().trim() : '';
      const orgChain = iChain >= 0 ? $(cells[iChain]).text().trim() : '';
      const detailHref = iTitle >= 0 ? $(cells[iTitle]).find('a').attr('href') ?? '' : '';

      const { title, referenceNo, tenderId } = parseTitleCell(titleCellText);
      if (!title && !tenderId && !referenceNo) return;

      out.push({
        organisation: orgName,
        title: title || referenceNo || tenderId || '(untitled)',
        referenceNo,
        tenderId,
        publishedDate,
        closingDate,
        openingDate,
        orgChain,
        detailLink: detailHref
          ? detailHref.startsWith('http')
            ? detailHref
            : `${CPPP_BASE}${detailHref}`
          : '',
        source: 'CPPP',
      });
    });
  });

  return out;
}

/**
 * CPPP title cell format: `[Title][RefNo][TenderID]`.
 * Titles occasionally embed brackets; pair them defensively by counting depth.
 */
export function parseTitleCell(raw: string): { title: string; referenceNo: string; tenderId: string } {
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of raw) {
    if (ch === '[') {
      if (depth === 0) buf = '';
      else buf += ch;
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) {
        parts.push(buf.trim());
        buf = '';
      } else if (depth > 0) {
        buf += ch;
      }
    } else if (depth > 0) {
      buf += ch;
    }
  }
  return {
    title: parts[0] ?? '',
    referenceNo: parts[1] ?? '',
    tenderId: parts[2] ?? '',
  };
}

/**
 * CPPP date format example: "26-Mar-2026 06:00 PM".
 * Returns an ISO string in UTC, assuming the input is IST (+05:30).
 */
export function parseCPPPDate(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const parsed = parseDate(cleaned, 'dd-MMM-yyyy hh:mm a', new Date());
  if (Number.isNaN(parsed.getTime())) return null;
  // Treat parsed local components as IST by subtracting the local/IST offset
  // so the produced Date represents the correct UTC instant regardless of
  // the server's timezone.
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const localOffsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  const utcMs = parsed.getTime() - localOffsetMs - istOffsetMs;
  return new Date(utcMs).toISOString();
}
