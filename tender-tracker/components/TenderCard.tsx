import { format, formatDistanceToNow, differenceInHours } from 'date-fns';
import { ExternalLink, Calendar, Building2, Tag, Hash } from 'lucide-react';
import type { Tender } from '@/lib/types';

export function TenderCard({ tender }: { tender: Tender }) {
  const closing = tender.closing_date ? new Date(tender.closing_date) : null;
  const urgency = closing ? urgencyOf(closing) : null;

  return (
    <article
      className={[
        'rounded-lg border bg-white p-4 transition-colors hover:border-neutral-400',
        urgency ? URGENCY_BORDER[urgency.band] : 'border-neutral-200',
      ].join(' ')}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <RelevanceBadge relevance={tender.relevance} />
          <SourceBadge source={tender.source} />
          {urgency && <UrgencyBadge urgency={urgency} />}
        </div>
        {tender.detail_link && (
          <a
            href={tender.detail_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
          >
            Open on portal <ExternalLink size={12} />
          </a>
        )}
      </header>

      <h3 className="mt-2 text-base leading-snug font-semibold text-neutral-900">
        {tender.title}
      </h3>

      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-neutral-600 sm:grid-cols-2">
        <MetaRow icon={Building2} label="Organisation" value={tender.organisation} />
        {tender.reference_no && (
          <MetaRow icon={Hash} label="Ref No" value={tender.reference_no} mono />
        )}
        {closing && (
          <MetaRow
            icon={Calendar}
            label="Closing"
            value={`${format(closing, 'dd MMM yyyy, hh:mm a')}`}
          />
        )}
        {tender.tender_id && (
          <MetaRow icon={Hash} label="Tender ID" value={tender.tender_id} mono />
        )}
      </dl>

      {tender.matched_keywords.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Tag size={12} className="text-neutral-400" />
          {tender.matched_keywords.map((k) => (
            <span
              key={k}
              className="rounded-md bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800"
            >
              {k}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

const URGENCY_BORDER: Record<'red' | 'orange' | 'yellow' | 'green', string> = {
  red: 'border-red-400 border-l-4',
  orange: 'border-orange-400 border-l-4',
  yellow: 'border-amber-400 border-l-4',
  green: 'border-emerald-300 border-l-4',
};

function urgencyOf(date: Date) {
  const hrs = differenceInHours(date, new Date());
  if (hrs < 24) return { band: 'red' as const, label: hrs <= 0 ? 'CLOSED' : 'CLOSING <24h' };
  if (hrs < 72) return { band: 'orange' as const, label: `CLOSING IN ${Math.floor(hrs / 24)}d` };
  if (hrs < 24 * 7) return { band: 'yellow' as const, label: `CLOSING IN ${Math.floor(hrs / 24)}d` };
  return { band: 'green' as const, label: formatDistanceToNow(date, { addSuffix: false }) };
}

function UrgencyBadge({ urgency }: { urgency: ReturnType<typeof urgencyOf> }) {
  const cls: Record<'red' | 'orange' | 'yellow' | 'green', string> = {
    red: 'bg-red-100 text-red-800',
    orange: 'bg-orange-100 text-orange-800',
    yellow: 'bg-amber-100 text-amber-800',
    green: 'bg-emerald-100 text-emerald-800',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase ${cls[urgency.band]}`}
    >
      {urgency.label}
    </span>
  );
}

function RelevanceBadge({ relevance }: { relevance: Tender['relevance'] }) {
  const cls = {
    HIGH: 'bg-red-600 text-white',
    MEDIUM: 'bg-amber-500 text-white',
    LOW: 'bg-neutral-300 text-neutral-800',
  }[relevance];
  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${cls}`}
    >
      {relevance}
    </span>
  );
}

function SourceBadge({ source }: { source: Tender['source'] }) {
  return (
    <span className="inline-flex rounded-md border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-neutral-700">
      {source}
    </span>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <Icon size={12} className="mt-0.5 shrink-0 text-neutral-400" />
      <div>
        <span className="text-neutral-500">{label}:</span>{' '}
        <span className={`text-neutral-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
      </div>
    </div>
  );
}
