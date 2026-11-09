'use client';

import { useState } from 'react';
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
  const [open, setOpen] = useState(false);

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

        {/* Desktop / tablet: horizontal scrollable row */}
        <div className="relative hidden flex-1 sm:block">
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

        {/* Mobile: hamburger menu */}
        <div className="flex flex-1 justify-end sm:hidden">
          <button
            type="button"
            aria-expanded={open}
            aria-label="Toggle navigation menu"
            onClick={() => { setOpen((v) => !v); }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line text-foreground"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {open ? '×' : '≡'}
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-line bg-void sm:hidden">
          <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-2">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => { setOpen(false); }}
                  className={`rounded-lg px-3 py-2 text-sm transition-colors min-h-11 inline-flex items-center ${
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
      ) : null}
    </nav>
  );
}