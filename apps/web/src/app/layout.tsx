import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'noop-cmf — Whoop-style analytics for CMF Watch Pro 2',
  description: 'Local-first physiological analytics and CMF Watch Pro 2 companion.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'noop-cmf' },
};

export const viewport: Viewport = {
  themeColor: '#0B0E14',
  width: 'device-width',
  initialScale: 1,
};

const NAV: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/', label: 'Overview' },
  { href: '/strain', label: 'Strain' },
  { href: '/recovery', label: 'Recovery' },
  { href: '/sleep', label: 'Sleep' },
  { href: '/journal', label: 'Journal' },
  { href: '/sync', label: 'Sync' },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav aria-label="Primary" className="flex flex-wrap gap-1 border-b border-card p-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-2 text-sm hover:bg-card"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto max-w-5xl p-4">{children}</main>
      </body>
    </html>
  );
}
