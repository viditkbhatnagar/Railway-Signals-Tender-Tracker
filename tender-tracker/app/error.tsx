'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-red-600" size={20} />
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-red-900">Something went wrong</h2>
          <p className="text-sm text-red-800">{error.message || 'Unknown error.'}</p>
          {error.digest && (
            <p className="font-mono text-xs text-red-700">digest: {error.digest}</p>
          )}
          <button
            onClick={reset}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            <RefreshCcw size={14} /> Try again
          </button>
        </div>
      </div>
    </div>
  );
}
