import { getServerSupabase } from './supabase';
import type { Tender, TenderSource, Relevance } from './types';

export interface TenderQuery {
  source?: TenderSource | 'all';
  relevance?: Relevance | 'all';
  status?: 'active' | 'expired' | 'all';
  closingWithinDays?: number;
  search?: string;
  sort?: 'closingDate' | 'publishedDate' | 'relevance';
  limit?: number;
  offset?: number;
}

export interface TenderListResult {
  tenders: Tender[];
  total: number;
}

export async function queryTenders(q: TenderQuery = {}): Promise<TenderListResult> {
  const supabase = getServerSupabase();
  const {
    source = 'all',
    relevance = 'all',
    status = 'active',
    closingWithinDays,
    search,
    sort = 'closingDate',
    limit = 200,
    offset = 0,
  } = q;

  let query = supabase.from('tenders').select('*', { count: 'exact' });

  if (source !== 'all') query = query.eq('source', source);
  if (relevance !== 'all') query = query.eq('relevance', relevance);

  const nowIso = new Date().toISOString();
  if (status === 'active') {
    query = query.or(`closing_date.gt.${nowIso},closing_date.is.null`);
  } else if (status === 'expired') {
    query = query.lt('closing_date', nowIso);
  }

  if (closingWithinDays && closingWithinDays > 0) {
    const horizon = new Date(Date.now() + closingWithinDays * 86_400_000).toISOString();
    query = query.gte('closing_date', nowIso).lte('closing_date', horizon);
  }

  if (search && search.trim()) {
    const s = search.trim().replace(/[%,]/g, ' ');
    query = query.or(
      `title.ilike.%${s}%,reference_no.ilike.%${s}%,organisation.ilike.%${s}%`
    );
  }

  if (sort === 'publishedDate') {
    query = query.order('published_date', { ascending: false, nullsFirst: false });
  } else if (sort === 'relevance') {
    // Relevance has no natural SQL order; sort by closing as a tie-breaker and
    // post-sort client-side in the page.
    query = query.order('closing_date', { ascending: true, nullsFirst: false });
  } else {
    query = query.order('closing_date', { ascending: true, nullsFirst: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`Supabase query failed: ${error.message}`);

  let rows = (data ?? []) as Tender[];
  if (sort === 'relevance') {
    const rank: Record<Relevance, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    rows = [...rows].sort((a, b) => rank[a.relevance] - rank[b.relevance]);
  }
  return { tenders: rows, total: count ?? rows.length };
}

export interface DashboardStats {
  totalActive: number;
  closingThisWeek: number;
  cpppCount: number;
  irepsCount: number;
  lastScrapedAt: string | null;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = getServerSupabase();
  const nowIso = new Date().toISOString();
  const weekIso = new Date(Date.now() + 7 * 86_400_000).toISOString();

  const [{ count: totalActive }, { count: closingThisWeek }, cppp, ireps, latest] =
    await Promise.all([
      supabase.from('tenders').select('id', { count: 'exact', head: true }).gt('closing_date', nowIso),
      supabase
        .from('tenders')
        .select('id', { count: 'exact', head: true })
        .gte('closing_date', nowIso)
        .lte('closing_date', weekIso),
      supabase
        .from('tenders')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'CPPP')
        .gt('closing_date', nowIso),
      supabase
        .from('tenders')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'IREPS')
        .gt('closing_date', nowIso),
      supabase
        .from('scrape_logs')
        .select('completed_at')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  return {
    totalActive: totalActive ?? 0,
    closingThisWeek: closingThisWeek ?? 0,
    cpppCount: cppp.count ?? 0,
    irepsCount: ireps.count ?? 0,
    lastScrapedAt: latest.data?.completed_at ?? null,
  };
}
