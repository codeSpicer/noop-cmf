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
      className="sticky top-0 z-10 border-b border-line bg-void"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
        <Link
          href="/"
          className="mr-2 shrink-0 whitespace-nowrap text-sm font-semibold text-foreground"
        >
          noop-cmf
        </Link>
        <div className="flex flex-nowrap gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
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
      </div>
    </nav>
  );
}
