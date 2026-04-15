import { NextRequest } from 'next/server';
import { scrapeIREPSZone, IREPS_ZONES } from '@/lib/ireps-scraper';
import { deserializeJar } from '@/lib/fetch-utils';
import { decryptSession } from '@/lib/encryption';
import { matchKeywords, classifyRelevance } from '@/lib/keywords';
import { upsertTenders, getActiveKeywords } from '@/lib/tender-store';
import type { ApiError, IREPSTenderRaw, Tender } from '@/lib/types';
import { parse as parseDate } from 'date-fns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface RequestBody {
  authToken: string;
  zoneId: string;
  zoneName?: string;
  keywords?: string[];
  onlyMatched?: boolean;
}

interface AuthState {
  jar: string;
  jsessionid: string;
  authenticated: boolean;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return badRequest('Invalid JSON');
  }
  if (!body.authToken) return badRequest('Missing authToken');
  if (!body.zoneId) return badRequest('Missing zoneId');

  let state: AuthState;
  try {
    state = JSON.parse(decryptSession(body.authToken)) as AuthState;
  } catch {
    return Response.json(
      { success: false, error: 'Invalid or expired authToken', code: 'SESSION_EXPIRED' } satisfies ApiError,
      { status: 401 }
    );
  }
  if (!state.authenticated) {
    return Response.json(
      { success: false, error: 'authToken is not authenticated', code: 'UNAUTHORIZED' } satisfies ApiError,
      { status: 401 }
    );
  }

  const zone =
    IREPS_ZONES.find((z) => z.id === body.zoneId) ??
    (body.zoneName ? { id: body.zoneId, name: body.zoneName } : null);
  if (!zone) return badRequest(`Unknown zoneId: ${body.zoneId}`);

  const jar = await deserializeJar(state.jar);

  let raw: IREPSTenderRaw[];
  try {
    raw = await scrapeIREPSZone(jar, zone);
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : 'Zone scrape failed', code: 'NETWORK_ERROR' } satisfies ApiError,
      { status: 502 }
    );
  }

  const keywords = body.keywords && body.keywords.length > 0
    ? body.keywords
    : await getActiveKeywords();
  const onlyMatched = body.onlyMatched !== false;

  const rows: Tender[] = [];
  let matchedCount = 0;
  for (const t of raw) {
    const matched = matchKeywords(
      {
        title: t.title,
        referenceNo: t.referenceNo,
        tenderId: t.tenderId,
        department: t.department,
        organisation: t.zone,
      },
      keywords
    );
    if (matched.length > 0) matchedCount++;
    if (onlyMatched && matched.length === 0) continue;

    rows.push({
      tender_id: t.tenderId,
      source: 'IREPS',
      title: t.title,
      reference_no: t.referenceNo || null,
      organisation: t.zone, // For IREPS the "organisation" is the railway zone.
      department: t.department || null,
      zone: t.zone,
      division: t.division ?? null,
      published_date: parseIrepsDate(t.publishedDate),
      closing_date: parseIrepsDate(t.closingDate),
      opening_date: parseIrepsDate(t.openingDate),
      estimated_value: t.estimatedValue ?? null,
      tender_type: t.tenderType ?? null,
      matched_keywords: matched,
      relevance: classifyRelevance(`${t.zone} ${t.department}`, matched),
      detail_link: t.detailLink ?? null,
    });
  }

  let saved = 0;
  let newCount = 0;
  if (rows.length > 0) {
    const r = await upsertTenders(rows);
    saved = r.saved;
    newCount = r.newCount;
  }

  return Response.json({
    zone: zone.name,
    totalTenders: raw.length,
    matchedCount,
    savedCount: saved,
    newCount,
    sessionValid: true,
  });
}

/**
 * IREPS dates appear in a few shapes; try the common ones and fall back to
 * letting Date constructor try (ISO etc.).
 */
function parseIrepsDate(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const formats = [
    'dd-MMM-yyyy hh:mm a',
    'dd-MMM-yyyy HH:mm',
    'dd/MM/yyyy HH:mm',
    'dd/MM/yyyy',
    'yyyy-MM-dd HH:mm',
    'yyyy-MM-dd',
  ];
  for (const f of formats) {
    const d = parseDate(s, f, new Date());
    if (!Number.isNaN(d.getTime())) {
      return shiftIstToUtc(d).toISOString();
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function shiftIstToUtc(d: Date): Date {
  const istMs = 5.5 * 60 * 60 * 1000;
  const localMs = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() - localMs - istMs);
}

function badRequest(msg: string): Response {
  const body: ApiError = { success: false, error: msg, code: 'BAD_REQUEST' };
  return Response.json(body, { status: 400 });
}
