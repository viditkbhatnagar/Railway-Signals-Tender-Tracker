'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { Search, Loader2 } from 'lucide-react';

const SOURCES = ['all', 'CPPP', 'IREPS'] as const;
const RELEVANCES = ['all', 'HIGH', 'MEDIUM', 'LOW'] as const;
const WINDOWS = [
  { value: '', label: 'Any closing date' },
  { value: '1', label: 'Closing within 24h' },
  { value: '3', label: 'Closing within 3 days' },
  { value: '7', label: 'Closing within 7 days' },
  { value: '30', label: 'Closing within 30 days' },
];
const SORTS = [
  { value: 'closingDate', label: 'Sort: Closing soonest' },
  { value: 'relevance', label: 'Sort: Relevance (HIGH first)' },
  { value: 'publishedDate', label: 'Sort: Recently published' },
];

export function FilterBar() {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(sp.get('search') ?? '');

  const update = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v) next.delete(k);
        else next.set(k, v);
      }
      startTransition(() => {
        router.replace(`/?${next.toString()}`, { scroll: false });
      });
    },
    [router, sp]
  );

  const currentSource = sp.get('source') ?? 'all';
  const currentRelevance = sp.get('relevance') ?? 'all';
  const currentWindow = sp.get('closingWithin') ?? '';
  const currentSort = sp.get('sort') ?? 'closingDate';

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          label="Source"
          value={currentSource}
          onChange={(v) => update({ source: v === 'all' ? undefined : v })}
          options={SOURCES.map((s) => ({ value: s, label: s === 'all' ? 'All sources' : s }))}
        />
        <Select
          label="Relevance"
          value={currentRelevance}
          onChange={(v) => update({ relevance: v === 'all' ? undefined : v })}
          options={RELEVANCES.map((r) => ({ value: r, label: r === 'all' ? 'Any relevance' : r }))}
        />
        <Select
          label="Window"
          value={currentWindow}
          onChange={(v) => update({ closingWithin: v || undefined })}
          options={WINDOWS}
        />
        <Select
          label="Sort"
          value={currentSort}
          onChange={(v) => update({ sort: v === 'closingDate' ? undefined : v })}
          options={SORTS}
        />

        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ search: search || undefined });
          }}
        >
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title / ref / org"
              className="w-56 rounded-md border border-neutral-300 bg-white py-1.5 pr-2 pl-7 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none"
            />
          </div>
          {isPending && <Loader2 size={14} className="animate-spin text-neutral-400" />}
        </form>
      </div>
    </section>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-sm">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
