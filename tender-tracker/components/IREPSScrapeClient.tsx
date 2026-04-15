'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Square, RefreshCcw, Smartphone, KeyRound, ShieldCheck } from 'lucide-react';
import { ScrapeProgress, type ScrapeState } from '@/components/ScrapeProgress';
import type { IREPSZone } from '@/lib/types';

const ZONE_DELAY_MS = 3000; // respectful pacing between zones

type Phase = 'idle' | 'init' | 'auth' | 'authenticated' | 'scraping' | 'done' | 'error';

interface InitResponse {
  sessionToken: string;
  captchaImage: string;
  captchaAudio: string;
  ready: boolean;
}

export function IREPSScrapeClient() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Session/auth state
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [captchaAudio, setCaptchaAudio] = useState<string | null>(null);

  // Form
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Scrape progress
  const [scrapeState, setScrapeState] = useState<ScrapeState>({ phase: 'idle' });
  const [matched, setMatched] = useState(0);
  const [saved, setSaved] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef(false);

  const initSession = useCallback(async () => {
    setErrorMsg(null);
    setPhase('init');
    try {
      const res = await fetch('/api/ireps/init-session', { method: 'POST' });
      if (!res.ok) throw new Error(`Init failed: HTTP ${res.status}`);
      const data = (await res.json()) as InitResponse;
      setSessionToken(data.sessionToken);
      setCaptchaImage(data.captchaImage);
      setCaptchaAudio(data.captchaAudio);
      setCaptchaInput('');
      setPhase('auth');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Init failed');
      setPhase('error');
    }
  }, []);

  const refreshCaptcha = useCallback(() => {
    // Easiest path: re-init the session — gets a fresh JSESSIONID + struts
    // token + captcha all bound together.
    void initSession();
  }, [initSession]);

  const submitOtp = useCallback(async () => {
    if (!sessionToken) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ireps/submit-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          mobileNumber: mobile,
          countryCode: '91',
          otp,
          captchaInput,
        }),
      });
      const data = (await res.json()) as
        | { success: true; authToken: string; expiresAt: number }
        | { success: false; error: string };
      if (!res.ok || !('success' in data) || !data.success) {
        const message = !data || 'error' in data ? data.error : 'Authentication failed';
        setErrorMsg(message);
        // CAPTCHA is single-use — refresh it after a failed attempt.
        void initSession();
        return;
      }
      setAuthToken(data.authToken);
      setPhase('authenticated');
      setOtp('');
      setCaptchaInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }, [sessionToken, mobile, otp, captchaInput, initSession]);

  const scrapeZones = useCallback(async () => {
    if (!authToken) return;
    cancelRef.current = false;
    const abort = new AbortController();
    abortRef.current = abort;
    setPhase('scraping');
    setMatched(0);
    setSaved(0);
    setErrorCount(0);

    let zones: IREPSZone[] = [];
    try {
      const zres = await fetch('/api/ireps/zones', { signal: abort.signal });
      const zdata = (await zres.json()) as { zones: IREPSZone[] };
      zones = zdata.zones;
    } catch (err) {
      setScrapeState({ phase: 'error', message: err instanceof Error ? err.message : 'Zone list failed' });
      setPhase('error');
      return;
    }

    let logId: string | null = null;
    try {
      const lres = await fetch('/api/scrape-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'IREPS', orgsTotal: zones.length }),
      });
      if (lres.ok) logId = (await lres.json()).id as string;
    } catch {
      /* ignore */
    }

    const t0 = Date.now();
    let localMatched = 0;
    let localSaved = 0;
    let localErrors = 0;
    let totalScraped = 0;
    let lastIndex = 0;
    const errors: Array<{ zone: string; error: string }> = [];

    for (let i = 0; i < zones.length; i++) {
      if (cancelRef.current) break;
      lastIndex = i;
      const z = zones[i];

      setScrapeState({ phase: 'running', current: i, total: zones.length, currentName: z.name });

      try {
        const res = await fetch('/api/ireps/scrape-zone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authToken, zoneId: z.id, zoneName: z.name }),
          signal: abort.signal,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          if (j.code === 'SESSION_EXPIRED' || j.code === 'UNAUTHORIZED') {
            setErrorMsg('IREPS session expired — please re-authenticate.');
            setPhase('idle');
            setAuthToken(null);
            break;
          }
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const d = (await res.json()) as {
          totalTenders: number;
          matchedCount: number;
          savedCount: number;
        };
        totalScraped += d.totalTenders ?? 0;
        localMatched += d.matchedCount ?? 0;
        localSaved += d.savedCount ?? 0;
        setMatched(localMatched);
        setSaved(localSaved);
      } catch (err) {
        if (abort.signal.aborted) break;
        localErrors++;
        errors.push({ zone: z.name, error: err instanceof Error ? err.message : String(err) });
        setErrorCount(localErrors);
      }

      if (i < zones.length - 1 && !cancelRef.current) {
        await sleep(ZONE_DELAY_MS, abort.signal);
      }
    }

    const elapsed = Math.round((Date.now() - t0) / 1000);
    const completedZones = cancelRef.current ? lastIndex : zones.length;

    setScrapeState({
      phase: cancelRef.current ? 'paused' : 'done',
      current: completedZones,
      total: zones.length,
      matched: localMatched,
      saved: localSaved,
      errors: localErrors,
      seconds: elapsed,
    } as ScrapeState);
    setPhase('done');

    if (logId) {
      const finalStatus = cancelRef.current ? 'partial' : localErrors > 0 ? 'partial' : 'completed';
      fetch('/api/scrape-logs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: logId,
          status: finalStatus,
          totalScraped,
          matchedCount: localMatched,
          newCount: localSaved,
          orgsScraped: completedZones,
          errors,
          errorMessage: localErrors > 0 ? `${localErrors} zones failed` : undefined,
        }),
      }).catch(() => {});
    }

    router.refresh();
  }, [authToken, router]);

  const stopScrape = useCallback(() => {
    cancelRef.current = true;
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setPhase('idle');
    setSessionToken(null);
    setAuthToken(null);
    setCaptchaImage(null);
    setCaptchaAudio(null);
    setMobile('');
    setOtp('');
    setCaptchaInput('');
    setErrorMsg(null);
    setScrapeState({ phase: 'idle' });
    setMatched(0);
    setSaved(0);
    setErrorCount(0);
  }, []);

  return (
    <div className="space-y-4">
      <Stepper phase={phase} />

      {phase === 'idle' && (
        <div>
          <button
            onClick={initSession}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <Play size={14} /> Initialize IREPS session
          </button>
          <p className="mt-2 text-xs text-neutral-500">
            Loads the guest login page from ireps.gov.in and fetches a captcha challenge.
          </p>
        </div>
      )}

      {phase === 'init' && (
        <div className="text-sm text-neutral-600">Connecting to IREPS…</div>
      )}

      {(phase === 'auth' || (phase === 'error' && sessionToken && !authToken)) && captchaImage && (
        <div className="space-y-3 rounded-md border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-600">
            Open the <strong>IREPS Aapoorti</strong> app on your phone, tap{' '}
            <em>Generate OTP</em>, and type that OTP below — along with your mobile number and the
            captcha shown.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Mobile number" icon={Smartphone}>
              <div className="flex">
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-neutral-300 bg-neutral-100 px-2 text-sm text-neutral-600">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                  placeholder="10-digit mobile"
                  className="w-full rounded-r-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
                />
              </div>
            </Field>

            <Field label="OTP from IREPS app" icon={KeyRound}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit OTP"
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 font-mono text-sm tracking-widest focus:border-neutral-500 focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Verification code (captcha)" icon={ShieldCheck}>
            <div className="flex flex-wrap items-center gap-2">
              <img
                src={`data:image/jpeg;base64,${captchaImage}`}
                alt="Captcha"
                className="h-10 rounded border border-neutral-300 bg-white"
              />
              <button
                type="button"
                onClick={refreshCaptcha}
                title="Reload captcha"
                className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
              >
                <RefreshCcw size={12} /> Reload
              </button>
              <input
                type="text"
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                placeholder="Type what you see"
                className="w-44 rounded-md border border-neutral-300 px-2 py-1.5 font-mono text-sm focus:border-neutral-500 focus:outline-none"
                autoComplete="off"
              />
              {captchaAudio && (
                <CaptchaAudio audioBase64={captchaAudio} />
              )}
            </div>
          </Field>

          {errorMsg && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={submitOtp}
              disabled={
                submitting ||
                mobile.length !== 10 ||
                otp.length === 0 ||
                captchaInput.length === 0
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Authenticate'}
            </button>
            <button
              onClick={reset}
              className="text-xs text-neutral-500 hover:underline"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {phase === 'authenticated' && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="font-medium text-emerald-900">
            IREPS authenticated. Session valid for ~24h.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={scrapeZones}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              <Play size={14} /> Start IREPS scrape (17 zones)
            </button>
            <p className="text-xs text-emerald-800">
              ~3s pause between zones — full run takes about 1 minute.
            </p>
          </div>
        </div>
      )}

      {(phase === 'scraping' || phase === 'done') && (
        <div className="space-y-3">
          {phase === 'scraping' && (
            <button
              onClick={stopScrape}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <Square size={14} /> Stop
            </button>
          )}
          <ScrapeProgress
            state={scrapeState}
            matched={matched}
            saved={saved}
            errors={errorCount}
          />
          {phase === 'done' && (
            <div className="flex items-center gap-3 text-xs">
              <button
                onClick={scrapeZones}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-50"
              >
                <RefreshCcw size={12} /> Run again
              </button>
              <button onClick={reset} className="text-neutral-500 hover:underline">
                Start over
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'error' && !sessionToken && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {errorMsg ?? 'Something went wrong.'}
          <button
            onClick={initSession}
            className="ml-2 inline-flex items-center gap-1 text-xs font-medium underline"
          >
            <RefreshCcw size={12} /> Retry
          </button>
        </div>
      )}
    </div>
  );
}

function Stepper({ phase }: { phase: Phase }) {
  const steps = [
    { key: 'init' as const, label: 'Initialize' },
    { key: 'auth' as const, label: 'Mobile + OTP + Captcha' },
    { key: 'scraping' as const, label: 'Scrape zones' },
  ];
  const activeIndex =
    phase === 'idle' || phase === 'init'
      ? 0
      : phase === 'auth' || (phase === 'error' && !phase.toString().includes('scrap'))
        ? 1
        : phase === 'authenticated' || phase === 'scraping' || phase === 'done'
          ? 2
          : 0;
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={[
              'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
              i < activeIndex
                ? 'bg-emerald-500 text-white'
                : i === activeIndex
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-200 text-neutral-600',
            ].join(' ')}
          >
            {i + 1}
          </span>
          <span className={i === activeIndex ? 'font-medium text-neutral-900' : ''}>{s.label}</span>
          {i < steps.length - 1 && <span className="text-neutral-300">→</span>}
        </li>
      ))}
    </ol>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof Smartphone;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-600">
        <Icon size={12} className="text-neutral-400" />
        {label}
      </span>
      {children}
    </label>
  );
}

function CaptchaAudio({ audioBase64 }: { audioBase64: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  // Lazy: only create the audio element when the user actually plays it.
  // Avoids rendering a multi-hundred-KB data URL in initial DOM cost.
  useEffect(() => () => ref.current?.pause(), []);
  return (
    <button
      type="button"
      onClick={() => {
        if (!ref.current) {
          const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
          ref.current = audio;
        }
        ref.current?.play();
      }}
      className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
      title="Play captcha audio"
    >
      🔊 Audio
    </button>
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
