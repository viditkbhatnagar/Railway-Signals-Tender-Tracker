import { format, formatDistanceToNow } from 'date-fns';
import { CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { getServerSupabase } from '@/lib/supabase';
import type { ScrapeLog } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function loadLogs(): Promise<{ logs: ScrapeLog[]; error: string | null }> {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('scrape_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(50);
    if (error) return { logs: [], error: error.message };
    return { logs: (data ?? []) as ScrapeLog[], error: null };
  } catch (err) {
    return { logs: [], error: err instanceof Error ? err.message : 'Failed' };
  }
}

export default async function HistoryPage() {
  const { logs, error } = await loadLogs();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">History</h1>
        <p className="text-sm text-neutral-500">
          Past scrape runs (most recent first). Cron-triggered runs and manual runs are mixed.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-medium">Could not load history.</p>
          <p className="mt-1 font-mono text-xs break-all">{error}</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
          No scrape runs yet. Trigger one from the{' '}
          <a href="/scrape" className="text-blue-700 underline">Scrape</a> page.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-right">Duration</th>
                <th className="px-3 py-2 text-right">Scraped</th>
                <th className="px-3 py-2 text-right">Matched</th>
                <th className="px-3 py-2 text-right">New</th>
                <th className="px-3 py-2 text-right">Orgs/Zones</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-neutral-900">
                      {format(new Date(l.started_at), 'dd MMM, hh:mm a')}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {formatDistanceToNow(new Date(l.started_at), { addSuffix: true })}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-xs">{l.source}</td>
                  <td className="px-3 py-2 align-top text-right tabular-nums">
                    {l.duration_seconds != null ? `${l.duration_seconds}s` : '—'}
                  </td>
                  <td className="px-3 py-2 align-top text-right tabular-nums">
                    {l.total_scraped}
                  </td>
                  <td className="px-3 py-2 align-top text-right tabular-nums font-semibold">
                    {l.matched_count}
                  </td>
                  <td className="px-3 py-2 align-top text-right tabular-nums">{l.new_count}</td>
                  <td className="px-3 py-2 align-top text-right tabular-nums">
                    {l.orgs_scraped}/{l.orgs_total}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <StatusPill status={l.status} />
                    {l.error_message && (
                      <div className="mt-1 text-xs text-amber-700" title={l.error_message}>
                        {truncate(l.error_message, 60)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ScrapeLog['status'] }) {
  const map: Record<ScrapeLog['status'], { cls: string; icon: typeof CheckCircle2; label: string }> = {
    completed: { cls: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2, label: 'Completed' },
    running: { cls: 'bg-blue-100 text-blue-800', icon: Loader2, label: 'Running' },
    partial: { cls: 'bg-amber-100 text-amber-800', icon: AlertCircle, label: 'Partial' },
    failed: { cls: 'bg-red-100 text-red-800', icon: XCircle, label: 'Failed' },
  };
  const { cls, icon: Icon, label } = map[status] ?? map.failed;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${cls}`}
    >
      <Icon size={10} className={status === 'running' ? 'animate-spin' : ''} />
      {label}
    </span>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
