import type { Tender } from './types';
import { getServerSupabase } from './supabase';

/**
 * Upsert tenders into Supabase keyed by (tender_id, source).
 * Returns how many rows were new vs. updated so scrape logs can show "new_count".
 */
export async function upsertTenders(tenders: Tender[]): Promise<{
  saved: number;
  newCount: number;
}> {
  if (tenders.length === 0) return { saved: 0, newCount: 0 };

  const supabase = getServerSupabase();

  // Probe existing rows so we can compute new_count.
  const keys = tenders.map((t) => `${t.source}::${t.tender_id}`);
  const { data: existing, error: selectErr } = await supabase
    .from('tenders')
    .select('tender_id, source')
    .in('tender_id', tenders.map((t) => t.tender_id));
  if (selectErr) throw new Error(`Supabase select failed: ${selectErr.message}`);

  const existingSet = new Set(
    (existing ?? []).map((r) => `${r.source}::${r.tender_id}`)
  );
  const newCount = keys.filter((k) => !existingSet.has(k)).length;

  const { error } = await supabase
    .from('tenders')
    .upsert(tenders, { onConflict: 'tender_id,source' });
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);

  return { saved: tenders.length, newCount };
}

export async function getActiveKeywords(): Promise<string[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('keywords')
    .select('keyword')
    .eq('is_active', true);
  if (error) throw new Error(`Supabase keywords fetch failed: ${error.message}`);
  return (data ?? []).map((r) => r.keyword as string);
}
