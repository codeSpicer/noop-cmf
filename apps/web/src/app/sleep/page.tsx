'use client';

import { useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Hypnogram } from '@/components/charts/Hypnogram';
import { getDatabase } from '@/db/database';
import { loadSleep } from '@/lib/db-analytics';
import type { SleepView } from '@/lib/db-analytics';
import { loadSleepConsistency } from '@/lib/sleep-consistency';
import { errorMessage } from '@/lib/errors';

export default function SleepPage() {
  const [view, setView] = useState<SleepView | null>(null);
  const [consistency, setConsistency] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const db = getDatabase();
        const [data, c] = await Promise.all([loadSleep(db), loadSleepConsistency(db)]);
        if (cancelled) return;
        setView(data);
        setConsistency(c);
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
    return <p>No data yet — sync a watch from the Sync page.</p>;
  }
  return (
    <section aria-label="Sleep" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Last night</p>
        <h1 className="text-2xl font-semibold text-foreground">Sleep</h1>
        <p className="text-sm text-muted max-w-prose">
           Hypnogram: lighter purple = light sleep, darker purple = deep sleep, purple = REM, gray = awake. Sleep need tonight = 7.5h baseline + extra for today&apos;s strain and sleep debt. Consistency = how regular your bed/wake times are (0-100).
        </p>
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
        {consistency !== null ? (
          <p data-testid="sleep-consistency" className="text-muted">
            Sleep consistency: <span className="text-foreground">{consistency}/100</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
