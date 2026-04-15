import { NextRequest } from 'next/server';
import {
  fetchOrgTenders,
  fetchOrgListing,
  parseCPPPDate,
} from '@/lib/cppp-scraper';
import { deserializeJar } from '@/lib/fetch-utils';
import { decryptSession } from '@/lib/encryption';
import { matchKeywords, classifyRelevance } from '@/lib/keywords';
import { upsertTenders, getActiveKeywords } from '@/lib/tender-store';
import type { ApiError, CPPPTenderRaw, Tender } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface RequestBody {
  sessionId?: string;
  orgLink: string;
  orgName: string;
  keywords?: string[];
  /** If true, only keyword-matched tenders are persisted. Defaults to true. */
  onlyMatched?: boolean;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (!body.orgLink || !body.orgName) {
    return badRequest('Missing orgLink or orgName');
  }

  // Either use the supplied session jar or bootstrap a fresh one if expired.
  let jar;
  try {
    if (body.sessionId) {
      jar = await deserializeJar(decryptSession(body.sessionId));
    } else {
      const init = await fetchOrgListing();
      jar = init.jar;
    }
  } catch {
    const init = await fetchOrgListing();
    jar = init.jar;
  }

  let rawTenders: CPPPTenderRaw[];
  try {
    const result = await fetchOrgTenders(
      { name: body.orgName, link: body.orgLink },
      jar
    );
    rawTenders = result.tenders;
  } catch (err) {
    const apiErr: ApiError = {
      success: false,
      error: err instanceof Error ? err.message : 'Scrape failed',
      code: 'NETWORK_ERROR',
    };
    return Response.json(apiErr, { status: 502 });
  }

  const keywords = body.keywords && body.keywords.length > 0
    ? body.keywords
    : await getActiveKeywords();

  const onlyMatched = body.onlyMatched !== false;

  const rows: Tender[] = [];
  let matchedCount = 0;
  for (const t of rawTenders) {
    const matched = matchKeywords(
      {
        title: t.title,
        referenceNo: t.referenceNo,
        tenderId: t.tenderId,
        orgChain: t.orgChain,
        organisation: t.organisation,
      },
      keywords
    );
    if (matched.length > 0) matchedCount++;
    if (onlyMatched && matched.length === 0) continue;

    rows.push({
      tender_id: t.tenderId || t.referenceNo || `${t.organisation}:${t.title}`.slice(0, 120),
      source: 'CPPP',
      title: t.title,
      reference_no: t.referenceNo || null,
      organisation: t.organisation,
      org_chain: t.orgChain || null,
      published_date: parseCPPPDate(t.publishedDate),
      closing_date: parseCPPPDate(t.closingDate),
      opening_date: parseCPPPDate(t.openingDate),
      matched_keywords: matched,
      relevance: classifyRelevance(t.organisation, matched),
      detail_link: t.detailLink || null,
    });
  }

  let saved = 0;
  let newCount = 0;
  if (rows.length > 0) {
    const res = await upsertTenders(rows);
    saved = res.saved;
    newCount = res.newCount;
  }

  return Response.json({
    orgName: body.orgName,
    totalTenders: rawTenders.length,
    matchedCount,
    savedCount: saved,
    newCount,
    tenders: rawTenders,
  });
}

function badRequest(msg: string): Response {
  const body: ApiError = { success: false, error: msg, code: 'BAD_REQUEST' };
  return Response.json(body, { status: 400 });
}
