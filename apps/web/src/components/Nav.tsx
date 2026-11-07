'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/', label: 'Overview' },
  { href: '/strain', label: 'Strain' },
  { href: '/recovery', label: 'Recovery' },
  { href: '/sleep', label: 'Sleep' },
  { href: '/journal', label: 'Journal' },
  { href: '/sync', label: 'Sync' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-10 border-b border-line bg-void pt-[env(safe-area-inset-top)]"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 sm:px-6">
        <Link
          href="/"
          className="mr-2 shrink-0 whitespace-nowrap text-sm font-semibold text-foreground"
        >
          noop-cmf
        </Link>
        <div className="relative flex-1">
          <div className="flex flex-nowrap gap-1 overflow-x-auto pr-6">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors min-h-11 inline-flex items-center ${
                  active
                    ? 'bg-surface text-foreground'
                    : 'text-muted hover:bg-surface hover:text-foreground'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-void to-transparent"
          />
        </div>
      </div>
    </nav>
  );
}
