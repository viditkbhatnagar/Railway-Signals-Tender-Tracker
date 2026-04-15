'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Square, ExternalLink } from 'lucide-react';
import { ScrapeProgress, type ScrapeState } from '@/components/ScrapeProgress';
import type { CPPPOrg, CPPPInitResponse } from '@/lib/types';

const DELAY_MS = 2500; // respectful pacing between orgs

interface LivePreview {
  orgName: string;
  title: string;
  refNo: string;
  matched: string[];
}

export function CPPPScrapeClient() {
  const router = useRouter();
  const [state, setState] = useState<ScrapeState>({ phase: 'idle' });
  const [matched, setMatched] = useState(0);
  const [saved, setSaved] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [preview, setPreview] = useState<LivePreview[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef(false);

  const start = useCallback(async () => {
    setState({ phase: 'starting' });
    setMatched(0);
    setSaved(0);
    setErrorCount(0);
    setPreview([]);
    cancelRef.current = false;
    const abort = new AbortController();
    abortRef.current = abort;

    let init: CPPPInitResponse;
    let logId: string | null = null;
    const t0 = Date.now();

    try {
      const res = await fetch('/api/cppp/init', { method: 'POST', signal: abort.signal });
      if (!res.ok) throw new Error(`init failed: HTTP ${res.status}`);
      init = (await res.json()) as CPPPInitResponse;
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Init failed',
      });
      return;
    }

    // Start a scrape log (best-effort — non-blocking).
    try {
      const lres = await fetch('/api/scrape-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'CPPP', orgsTotal: init.orgs.length }),
      });
      if (lres.ok) logId = (await lres.json()).id as string;
    } catch {
      /* ignore */
    }

    // Prioritise likely-railway orgs so the user sees matches faster.
    const orgs = prioritiseOrgs(init.orgs);
    let localMatched = 0;
    let localSaved = 0;
    let localErrors = 0;
    let totalScraped = 0;
    let lastIndex = 0;
    const errors: Array<{ org: string; error: string }> = [];

    for (let i = 0; i < orgs.length; i++) {
      if (cancelRef.current) break;
      lastIndex = i;
      const org = orgs[i];

      setState({
        phase: 'running',
        current: i,
        total: orgs.length,
        currentName: org.name,
      });

      try {
        const res = await fetch('/api/cppp/scrape-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: init.sessionId,
            orgLink: org.link,
            orgName: org.name,
          }),
          signal: abort.signal,
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          totalTenders: number;
          matchedCount: number;
          savedCount: number;
          tenders: Array<{
            title: string;
            referenceNo: string;
            organisation: string;
          }>;
        };

        totalScraped += data.totalTenders ?? 0;
        localMatched += data.matchedCount ?? 0;
        localSaved += data.savedCount ?? 0;
        setMatched(localMatched);
        setSaved(localSaved);

        if ((data.matchedCount ?? 0) > 0) {
          // Surface one preview row per matched org (avoid flooding the UI)
          const sample = data.tenders.find(() => true);
          if (sample) {
            setPreview((prev) =>
              [
                {
                  orgName: org.name,
                  title: sample.title,
                  refNo: sample.referenceNo,
                  matched: [],
                },
                ...prev,
              ].slice(0, 10)
            );
          }
        }
      } catch (err) {
        if (abort.signal.aborted) break;
        localErrors++;
        errors.push({
          org: org.name,
          error: err instanceof Error ? err.message : String(err),
        });
        setErrorCount(localErrors);
      }

      if (i < orgs.length - 1 && !cancelRef.current) {
        await sleep(DELAY_MS, abort.signal);
      }
    }

    const elapsed = Math.round((Date.now() - t0) / 1000);
    const completedOrgs = cancelRef.current ? lastIndex : orgs.length;

    if (cancelRef.current) {
      setState({
        phase: 'paused',
        current: completedOrgs,
        total: orgs.length,
      });
    } else {
      setState({
        phase: 'done',
        total: orgs.length,
        matched: localMatched,
        saved: localSaved,
        errors: localErrors,
        seconds: elapsed,
      });
    }

    if (logId) {
      const finalStatus = cancelRef.current
        ? 'partial'
        : localErrors > 0
          ? 'partial'
          : 'completed';
      fetch('/api/scrape-logs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: logId,
          status: finalStatus,
          totalScraped,
          matchedCount: localMatched,
          newCount: localSaved,
          orgsScraped: completedOrgs,
          errors,
          errorMessage: localErrors > 0 ? `${localErrors} orgs failed` : undefined,
        }),
      }).catch(() => {
        /* best-effort */
      });
    }

    router.refresh();
  }, [router]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    abortRef.current?.abort();
  }, []);

  const isRunning = state.phase === 'starting' || state.phase === 'running';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!isRunning ? (
          <button
            onClick={start}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <Play size={14} />
            {state.phase === 'done' ? 'Run again' : 'Start CPPP scrape'}
          </button>
        ) : (
          <button
            onClick={cancel}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            <Square size={14} />
            Stop
          </button>
        )}
        <p className="text-xs text-neutral-500">
          Scrapes ~160 organisations with a 2.5s pause between each — takes roughly 6–8 minutes.
        </p>
      </div>

      <ScrapeProgress state={state} matched={matched} saved={saved} errors={errorCount} />

      {preview.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Recent matches
          </div>
          <ul className="space-y-1 rounded-md border border-neutral-200 bg-white p-2 text-xs">
            {preview.map((p, i) => (
              <li key={`${p.orgName}-${i}`} className="flex items-start gap-2">
                <ExternalLink size={11} className="mt-0.5 shrink-0 text-neutral-400" />
                <div>
                  <div className="font-medium text-neutral-900">{p.title}</div>
                  <div className="text-neutral-500">
                    {p.orgName} {p.refNo && `· ${p.refNo}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

const RAILWAY_HINTS = [
  'ircon',
  'rites',
  'metro',
  'rail',
  'railway',
  'k-ride',
  'kride',
  'central electronics',
  'rvnl',
  'dfccil',
  'ncrtc',
  'nhsrcl',
  'bsnl',
];

function prioritiseOrgs(orgs: CPPPOrg[]): CPPPOrg[] {
  return [...orgs].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.sno - b.sno;
  });
}

function rank(o: CPPPOrg): number {
  const n = o.name.toLowerCase();
  return RAILWAY_HINTS.some((h) => n.includes(h)) ? 0 : 1;
}
