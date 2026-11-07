import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Nav } from '@/components/Nav';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { InstallPrompt } from '@/components/InstallPrompt';
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <ServiceWorkerRegistrar />
        <InstallPrompt />
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
