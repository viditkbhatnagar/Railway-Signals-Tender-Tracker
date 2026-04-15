'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Play, Tags, History } from 'lucide-react';

const LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/scrape', label: 'Scrape', icon: Play },
  { href: '/keywords', label: 'Keywords', icon: Tags },
  { href: '/history', label: 'History', icon: History },
];

export function Navigation() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
          <span aria-hidden>🚂</span>
          <span>Railway S&amp;T Tender Tracker</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors',
                  active
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                ].join(' ')}
              >
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
