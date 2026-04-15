import { formatDistanceToNow } from 'date-fns';
import { Clock, Info } from 'lucide-react';
import { CPPPScrapeClient } from '@/components/CPPPScrapeClient';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface LastRun {
  startedAt: string;
  completedAt: string | null;
  totalScraped: number;
  matchedCount: number;
  status: string;
}

async function getLastRun(source: 'CPPP' | 'IREPS'): Promise<LastRun | null> {
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase
      .from('scrape_logs')
      .select('started_at, completed_at, total_scraped, matched_count, status')
      .eq('source', source)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      startedAt: data.started_at,
      completedAt: data.completed_at,
      totalScraped: data.total_scraped ?? 0,
      matchedCount: data.matched_count ?? 0,
      status: data.status,
    };
  } catch {
    return null;
  }
}

export default async function ScrapePage() {
  const [cpppLast, irepsLast] = await Promise.all([getLastRun('CPPP'), getLastRun('IREPS')]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Scrape tenders</h1>
        <p className="text-sm text-neutral-500">
          Fetch the latest tenders from CPPP and IREPS. Results are merged into the dashboard.
        </p>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">
              CPPP · etenders.gov.in
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              No authentication needed. Iterates through all organisations.
            </p>
          </div>
          <LastRunLabel last={cpppLast} />
        </header>

        <div className="mt-3">
          <CPPPScrapeClient />
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4 opacity-75">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">
              IREPS · ireps.gov.in
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Requires OTP from the IREPS mobile app (not SMS). Same OTP valid for ~24h.
            </p>
          </div>
          <LastRunLabel last={irepsLast} />
        </header>

        <div className="mt-3 rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-3">
          <div className="flex items-start gap-2 text-xs text-neutral-600">
            <Info size={14} className="mt-0.5 shrink-0 text-neutral-400" />
            <div>
              IREPS scraping ships in <strong>Phase 5–6</strong>. You&apos;ll click{' '}
              <em>Initialize session</em>, enter your mobile number, then type the OTP shown in
              the IREPS app. The backend then scrapes all 17 railway zones sequentially.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function LastRunLabel({ last }: { last: LastRun | null }) {
  if (!last) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-500">
        <Clock size={11} />
        Never scraped
      </span>
    );
  }
  const when = formatDistanceToNow(new Date(last.startedAt), { addSuffix: true });
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-500">
      <Clock size={11} />
      Last: {when} · {last.totalScraped} scraped / {last.matchedCount} matched ·{' '}
      <span
        className={
          last.status === 'completed'
            ? 'text-emerald-700'
            : last.status === 'running'
              ? 'text-blue-700'
              : last.status === 'partial'
                ? 'text-amber-700'
                : 'text-red-700'
        }
      >
        {last.status}
      </span>
    </span>
  );
}
