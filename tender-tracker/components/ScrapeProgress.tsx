import { Loader2, CheckCircle2, XCircle, Pause } from 'lucide-react';

export type ScrapeState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'running'; current: number; total: number; currentName: string | null }
  | { phase: 'paused'; current: number; total: number }
  | { phase: 'done'; total: number; matched: number; saved: number; errors: number; seconds: number }
  | { phase: 'error'; message: string };

export function ScrapeProgress({
  state,
  matched,
  saved,
  errors,
}: {
  state: ScrapeState;
  matched: number;
  saved: number;
  errors: number;
}) {
  if (state.phase === 'idle') return null;

  const pct =
    state.phase === 'running' || state.phase === 'paused'
      ? state.total > 0
        ? Math.round((state.current / state.total) * 100)
        : 0
      : state.phase === 'done'
        ? 100
        : 0;

  return (
    <div className="mt-3 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 font-medium text-neutral-700">
          {state.phase === 'starting' && (
            <>
              <Loader2 size={14} className="animate-spin text-neutral-500" />
              Initialising CPPP session…
            </>
          )}
          {state.phase === 'running' && (
            <>
              <Loader2 size={14} className="animate-spin text-blue-600" />
              Scraping {state.current} / {state.total}
              {state.currentName && (
                <span className="max-w-[280px] truncate text-neutral-500">
                  · {state.currentName}
                </span>
              )}
            </>
          )}
          {state.phase === 'paused' && (
            <>
              <Pause size={14} className="text-amber-600" />
              Paused at {state.current} / {state.total}
            </>
          )}
          {state.phase === 'done' && (
            <>
              <CheckCircle2 size={14} className="text-emerald-600" />
              Done in {state.seconds}s — {state.total} orgs, {matched} matched tenders
              {errors > 0 && (
                <span className="text-amber-700">
                  {' '}
                  · {errors} error{errors === 1 ? '' : 's'}
                </span>
              )}
            </>
          )}
          {state.phase === 'error' && (
            <>
              <XCircle size={14} className="text-red-600" />
              {state.message}
            </>
          )}
        </div>
        <div className="font-mono text-neutral-500">{pct}%</div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
        <div
          className={[
            'h-full transition-all',
            state.phase === 'done'
              ? 'bg-emerald-500'
              : state.phase === 'error'
                ? 'bg-red-500'
                : 'bg-blue-500',
          ].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
        <span>
          Matched: <strong className="text-neutral-900">{matched}</strong>
        </span>
        <span>
          Saved: <strong className="text-neutral-900">{saved}</strong>
        </span>
        {errors > 0 && (
          <span className="text-amber-700">
            Errors: <strong>{errors}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
