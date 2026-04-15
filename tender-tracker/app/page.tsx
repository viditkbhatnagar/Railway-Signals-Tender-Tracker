import Link from 'next/link';
import { Play, Inbox, Download } from 'lucide-react';
import { StatsBar } from '@/components/StatsBar';
import { FilterBar } from '@/components/FilterBar';
import { TenderCard } from '@/components/TenderCard';
import {
  queryTenders,
  getDashboardStats,
  type TenderQuery,
} from '@/lib/tender-queries';
import type { TenderSource, Relevance } from '@/lib/types';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{
  source?: string;
  relevance?: string;
  status?: string;
  closingWithin?: string;
  search?: string;
  sort?: string;
}>;

function parseSource(v?: string): TenderQuery['source'] {
  return v === 'CPPP' || v === 'IREPS' ? (v as TenderSource) : 'all';
}
function parseRelevance(v?: string): TenderQuery['relevance'] {
  return v === 'HIGH' || v === 'MEDIUM' || v === 'LOW' ? (v as Relevance) : 'all';
}
function parseStatus(v?: string): TenderQuery['status'] {
  return v === 'active' || v === 'expired' || v === 'all' ? v : 'active';
}
function parseSort(v?: string): TenderQuery['sort'] {
  return v === 'publishedDate' || v === 'relevance' ? v : 'closingDate';
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const q: TenderQuery = {
    source: parseSource(sp.source),
    relevance: parseRelevance(sp.relevance),
    status: parseStatus(sp.status),
    sort: parseSort(sp.sort),
    closingWithinDays: sp.closingWithin ? parseInt(sp.closingWithin, 10) : undefined,
    search: sp.search,
    limit: 200,
  };

  // Pass-through for the export link so it inherits current filters.
  const exportParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v) exportParams.set(k, v);
  }

  let stats = {
    totalActive: 0,
    closingThisWeek: 0,
    cpppCount: 0,
    irepsCount: 0,
    lastScrapedAt: null as string | null,
  };
  let tenders: Awaited<ReturnType<typeof queryTenders>>['tenders'] = [];
  let total = 0;
  let loadError: string | null = null;

  try {
    [stats, { tenders, total }] = await Promise.all([
      getDashboardStats(),
      queryTenders(q),
    ]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load tenders';
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
          <p className="text-sm text-neutral-500">
            Matched railway S&amp;T tenders from CPPP and IREPS.
          </p>
        </div>
        <Link
          href="/scrape"
          className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
        >
          <Play size={14} />
          Scrape now
        </Link>
      </div>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : (
        <>
          <StatsBar stats={stats} />
          <FilterBar />

          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>
              Showing <strong>{tenders.length}</strong> of {total} tender
              {total === 1 ? '' : 's'}
            </span>
            {total > 0 && (
              <a
                href={`/api/tenders/export?${exportParams.toString()}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 font-medium text-neutral-700 hover:bg-neutral-50"
              >
                <Download size={12} />
                Export to Excel
              </a>
            )}
          </div>

          {tenders.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-3">
              {tenders.map((t) => (
                <li key={`${t.source}:${t.tender_id}`}>
                  <TenderCard tender={t} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
      <Inbox className="mx-auto text-neutral-400" size={32} />
      <p className="mt-2 text-sm font-medium text-neutral-800">No matching tenders</p>
      <p className="mt-1 text-xs text-neutral-500">
        Adjust filters, or run a scrape from the <Link href="/scrape" className="underline">Scrape</Link> page.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="font-medium">Could not load tenders.</p>
      <p className="mt-1 font-mono text-xs break-all">{message}</p>
      <p className="mt-2 text-xs text-red-800">
        Check <code className="rounded bg-red-100 px-1">.env.local</code> — you need
        <code className="mx-1 rounded bg-red-100 px-1">SUPABASE_URL</code>,
        <code className="mx-1 rounded bg-red-100 px-1">SUPABASE_SERVICE_KEY</code>, and
        the migration in
        <code className="mx-1 rounded bg-red-100 px-1">supabase/migrations/001_init.sql</code> applied.
      </p>
    </div>
  );
}
