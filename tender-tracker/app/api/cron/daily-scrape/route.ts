import { NextRequest } from 'next/server';
import {
  fetchOrgListing,
  fetchOrgTenders,
  parseCPPPDate,
} from '@/lib/cppp-scraper';
import { matchKeywords, classifyRelevance } from '@/lib/keywords';
import { upsertTenders, getActiveKeywords } from '@/lib/tender-store';
import { getServerSupabase } from '@/lib/supabase';
import { sleep } from '@/lib/fetch-utils';
import type { Tender } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — Pro plan; downgrade to 60 if on Hobby

/**
 * Vercel Cron entrypoint: scrapes CPPP daily and upserts matched tenders.
 * Skips IREPS (requires manual OTP — not safe to automate).
 *
 * Auth:
 * - Vercel Cron sends a header `Authorization: Bearer ${CRON_SECRET}` (when
 *   CRON_SECRET is set in the project env). We require that match.
 * - Manual invocation also works with the same header (curl + bearer).
 *
 * Pacing: 2.5s between orgs, same as the UI orchestrator.
 * On Hobby plan you'll likely time out at ~10s — switch to triggering this
 * cron route only as a "kickoff" that calls the chunked /scrape-org route in
 * background, OR upgrade to Pro for 60s+ functions.
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (!authorised(req)) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServerSupabase();
  const t0 = Date.now();

  // Open a log row up-front so it shows in /history even if we crash.
  const { data: log, error: logErr } = await supabase
    .from('scrape_logs')
    .insert({ source: 'CPPP', status: 'running', orgs_total: 0, started_at: new Date().toISOString() })
    .select('id')
    .single();
  if (logErr) {
    return Response.json(
      { success: false, error: `log insert failed: ${logErr.message}` },
      { status: 500 }
    );
  }
  const logId = log.id as string;

  let orgs;
  let jar;
  try {
    const init = await fetchOrgListing();
    orgs = init.orgs;
    jar = init.jar;
  } catch (err) {
    await supabase
      .from('scrape_logs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: err instanceof Error ? err.message : String(err),
      })
      .eq('id', logId);
    return Response.json(
      { success: false, error: 'CPPP init failed' },
      { status: 502 }
    );
  }

  await supabase.from('scrape_logs').update({ orgs_total: orgs.length }).eq('id', logId);

  const keywords = await getActiveKeywords();

  let totalScraped = 0;
  let matchedCount = 0;
  let savedCount = 0;
  let newCount = 0;
  let processed = 0;
  const errors: Array<{ org: string; error: string }> = [];

  for (let i = 0; i < orgs.length; i++) {
    const org = orgs[i];
    try {
      const { tenders } = await fetchOrgTenders(org, jar);
      totalScraped += tenders.length;

      const rows: Tender[] = [];
      for (const t of tenders) {
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
        if (matched.length === 0) continue;
        matchedCount++;
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
      if (rows.length > 0) {
        const r = await upsertTenders(rows);
        savedCount += r.saved;
        newCount += r.newCount;
      }
      processed = i + 1;
    } catch (err) {
      errors.push({
        org: org.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (i < orgs.length - 1) await sleep(2500);
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);
  const finalStatus = errors.length > 0 ? 'partial' : 'completed';

  await supabase
    .from('scrape_logs')
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      total_scraped: totalScraped,
      matched_count: matchedCount,
      new_count: newCount,
      orgs_scraped: processed,
      errors,
      error_message: errors.length > 0 ? `${errors.length} orgs failed` : null,
      duration_seconds: elapsed,
    })
    .eq('id', logId);

  return Response.json({
    success: true,
    logId,
    status: finalStatus,
    durationSeconds: elapsed,
    orgsTotal: orgs.length,
    orgsProcessed: processed,
    totalScraped,
    matchedCount,
    savedCount,
    newCount,
    errors,
  });
}

function authorised(req: NextRequest): boolean {
  const required = process.env.CRON_SECRET;
  // If CRON_SECRET is unset, refuse to run — safer default than open access.
  if (!required) return false;
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${required}`;
  // Constant-time-ish compare (length check first, then char compare)
  if (auth.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < auth.length; i++) {
    mismatch |= auth.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
