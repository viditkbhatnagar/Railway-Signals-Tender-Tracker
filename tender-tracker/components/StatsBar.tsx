import { formatDistanceToNow } from 'date-fns';
import type { DashboardStats } from '@/lib/tender-queries';

export function StatsBar({ stats }: { stats: DashboardStats }) {
  const last = stats.lastScrapedAt
    ? `${formatDistanceToNow(new Date(stats.lastScrapedAt), { addSuffix: true })}`
    : 'Never';

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <StatTile label="Active" value={stats.totalActive} />
      <StatTile label="Closing ≤ 7d" value={stats.closingThisWeek} emphasis />
      <StatTile label="CPPP" value={stats.cpppCount} />
      <StatTile label="IREPS" value={stats.irepsCount} />
      <StatTile label="Last scraped" value={last} small />
    </section>
  );
}

function StatTile({
  label,
  value,
  emphasis,
  small,
}: {
  label: string;
  value: number | string;
  emphasis?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-lg border bg-white px-4 py-3',
        emphasis ? 'border-amber-300' : 'border-neutral-200',
      ].join(' ')}
    >
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div
        className={[
          'mt-1 font-semibold',
          small ? 'text-sm text-neutral-700' : 'text-2xl text-neutral-900',
          emphasis && !small ? 'text-amber-700' : '',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  );
}
