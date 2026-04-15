'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Plus, X, Tag, Loader2 } from 'lucide-react';
import type { Keyword } from '@/lib/types';

interface Props {
  initial: Keyword[];
}

export function KeywordManager({ initial }: Props) {
  const [keywords, setKeywords] = useState<Keyword[]>(initial);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/keywords');
    if (res.ok) {
      const j = (await res.json()) as { keywords: Keyword[] };
      setKeywords(j.keywords);
    }
  }, []);

  useEffect(() => {
    setKeywords(initial);
  }, [initial]);

  const add = useCallback(async () => {
    const value = draft.trim();
    if (!value) return;
    setError(null);
    const res = await fetch('/api/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: value }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? `HTTP ${res.status}`);
      return;
    }
    setDraft('');
    startTransition(() => {
      void refresh();
    });
  }, [draft, refresh]);

  const remove = useCallback(
    async (kw: Keyword) => {
      setBusyId(kw.id);
      try {
        const res = await fetch(`/api/keywords?id=${encodeURIComponent(kw.id)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? `HTTP ${res.status}`);
          return;
        }
        setKeywords((prev) => prev.filter((k) => k.id !== kw.id));
      } finally {
        setBusyId(null);
      }
    },
    []
  );

  const toggle = useCallback(async (kw: Keyword) => {
    setBusyId(kw.id);
    try {
      const res = await fetch('/api/keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: kw.id, is_active: !kw.is_active }),
      });
      if (!res.ok) return;
      setKeywords((prev) =>
        prev.map((k) => (k.id === kw.id ? { ...k, is_active: !k.is_active } : k))
      );
    } finally {
      setBusyId(null);
    }
  }, []);

  const defaults = keywords.filter((k) => k.category === 'default');
  const custom = keywords.filter((k) => k.category === 'custom');
  const activeCount = keywords.filter((k) => k.is_active).length;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-neutral-200 bg-white p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-neutral-600">
              Add keyword
            </label>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder='e.g. "Kavach", "ETCS", "OFC"'
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
              maxLength={120}
            />
          </div>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="inline-flex items-center gap-1.5 self-end rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={14} /> Add
          </button>
        </form>
        {error && (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
            {error}
          </div>
        )}
      </section>

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          <strong className="text-neutral-900">{activeCount}</strong> active /
          <span className="ml-1">{keywords.length} total</span>
        </span>
        {isPending && (
          <span className="inline-flex items-center gap-1 text-neutral-400">
            <Loader2 size={12} className="animate-spin" /> syncing
          </span>
        )}
      </div>

      <KeywordSection
        title="Custom keywords"
        items={custom}
        emptyHint="No custom keywords yet — add the first one above."
        onRemove={remove}
        onToggle={toggle}
        busyId={busyId}
        canRemove
      />
      <KeywordSection
        title="Default keywords"
        subtitle="Seeded for railway S&T. You can deactivate but not delete these."
        items={defaults}
        emptyHint="No default keywords found — run the migration."
        onRemove={remove}
        onToggle={toggle}
        busyId={busyId}
      />
    </div>
  );
}

function KeywordSection({
  title,
  subtitle,
  items,
  emptyHint,
  onRemove,
  onToggle,
  busyId,
  canRemove,
}: {
  title: string;
  subtitle?: string;
  items: Keyword[];
  emptyHint: string;
  onRemove: (k: Keyword) => void | Promise<void>;
  onToggle: (k: Keyword) => void | Promise<void>;
  busyId: string | null;
  canRemove?: boolean;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-3">
      <header className="mb-2">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {subtitle && <p className="text-xs text-neutral-500">{subtitle}</p>}
      </header>

      {items.length === 0 ? (
        <p className="text-xs text-neutral-500 italic">{emptyHint}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((kw) => {
            const busy = busyId === kw.id;
            return (
              <li
                key={kw.id}
                className={[
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                  kw.is_active
                    ? 'border-blue-200 bg-blue-50 text-blue-900'
                    : 'border-neutral-200 bg-neutral-100 text-neutral-500 line-through',
                ].join(' ')}
              >
                <Tag size={11} className="opacity-60" />
                <button
                  type="button"
                  onClick={() => onToggle(kw)}
                  className="font-medium hover:underline disabled:opacity-50"
                  title={kw.is_active ? 'Deactivate' : 'Activate'}
                  disabled={busy}
                >
                  {kw.keyword}
                </button>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(kw)}
                    className="ml-1 text-neutral-400 hover:text-red-600 disabled:opacity-50"
                    title="Delete"
                    disabled={busy}
                  >
                    <X size={11} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
