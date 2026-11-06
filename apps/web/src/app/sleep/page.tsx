'use client';

import { useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Hypnogram } from '@/components/charts/Hypnogram';
import { getDatabase } from '@/db/database';
import { loadSleep } from '@/lib/db-analytics';
import type { SleepView } from '@/lib/db-analytics';
import { errorMessage } from '@/lib/errors';

export default function SleepPage() {
  const [view, setView] = useState<SleepView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const db = getDatabase();
        const data = await loadSleep(db);
        if (cancelled) return;
        setView(data);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Failed to load sleep.'));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (!loaded) {
    return <p aria-busy="true">Loading sleep…</p>;
  }
  if (!view) {
    return <p>No data yet — sync a watch.</p>;
  }
  return (
    <section aria-label="Sleep" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Last night</p>
        <h1 className="text-2xl font-semibold text-foreground">Sleep</h1>
      </header>
      <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-6">
          <Hypnogram segments={view.segments} testId="hypnogram" />
        </div>
      </ErrorBoundary>
      <div className="rounded-2xl border border-line bg-card p-6">
        <p data-testid="sleep-need" className="text-muted">
          Tonight&apos;s sleep need:{' '}
          <span className="text-foreground">
            {Math.round(view.need / 60)}h {view.need % 60}m
          </span>
        </p>
        <p data-testid="sleep-total" className="text-muted">
          Total sleep: <span className="text-foreground">{Math.round(view.summary.totalSleepMinutes)} min</span>
        </p>
      </div>
    </section>
  );
}
