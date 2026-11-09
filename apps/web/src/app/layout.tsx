import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Nav } from '@/components/Nav';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { NotificationScheduler } from '@/components/NotificationScheduler';
import { InstallPrompt } from '@/components/InstallPrompt';
import './globals.css';

export const metadata: Metadata = {
  title: 'noop-cmf — Whoop-style analytics for CMF Watch Pro 2',
  description: 'Local-first physiological analytics and CMF Watch Pro 2 companion.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'noop-cmf' },
};

export const viewport: Viewport = {
  themeColor: '#0E0D0B',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-foreground"
        >
          Skip to content
        </a>
        <Nav />
        <ServiceWorkerRegistrar />
        <NotificationScheduler />
        <InstallPrompt />
        <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
