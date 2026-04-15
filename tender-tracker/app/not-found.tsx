import Link from 'next/link';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-10 text-center">
      <h2 className="text-3xl font-semibold text-neutral-900">404</h2>
      <p className="mt-2 text-sm text-neutral-500">That page doesn&apos;t exist.</p>
      <Link
        href="/"
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        <Home size={14} /> Back to dashboard
      </Link>
    </div>
  );
}
