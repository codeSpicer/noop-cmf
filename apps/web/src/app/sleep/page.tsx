'use client';

import { useEffect, useState } from 'react';
import { analyzeSleep, computeSleepDebt, computeSleepNeedTonight } from '@noop-cmf/physio-engine';
import { EpochMsSchema, type SleepSegment } from '@noop-cmf/types';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Hypnogram } from '@/components/charts/Hypnogram';
import { createDemoProvider, isDemoMode } from '@/lib/demo-provider';
import { errorMessage } from '@/lib/errors';

const NO_DEMO_MESSAGE = 'Connect a watch or enable demo mode (?demo=true).';

/** Sleep route: hypnogram, restorative breakdown, tonight's need. */
export default function SleepPage() {
  const [segments, setSegments] = useState<readonly SleepSegment[]>([]);
  const [need, setNeed] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        if (!isDemoMode(window.location.search)) {
          if (!cancelled) setError(NO_DEMO_MESSAGE);
          return;
        }
        const provider = await createDemoProvider(window.location.search);
        const end = EpochMsSchema.parse(Date.UTC(2024, 0, 30));
        const start = EpochMsSchema.parse(end - 86_400_000);
        const sleep = await provider.getSleepSegments({ start, end });
        if (cancelled) {
          return;
        }
        if (!sleep.ok) {
          setError(sleep.error.message);
          return;
        }
        setSegments(sleep.value);
        const summary = analyzeSleep(sleep.value);
        const debt = computeSleepDebt(0, 450, summary.totalSleepMinutes);
        setNeed(computeSleepNeedTonight(10, debt));
        setLoaded(true);
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, 'Failed to load sleep.'));
        }
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
  if (!loaded || need === null) {
    return <p aria-busy="true">Loading sleep…</p>;
  }
  return (
    <section aria-label="Sleep" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Last night</p>
        <h1 className="text-2xl font-semibold text-foreground">Sleep</h1>
      </header>
      <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-6">
          <Hypnogram segments={segments} testId="hypnogram" />
        </div>
      </ErrorBoundary>
      <div className="rounded-2xl border border-line bg-card p-6">
        <p data-testid="sleep-need" className="text-muted">
          Tonight&apos;s sleep need:{' '}
          <span className="text-foreground">
            {Math.round(need / 60)}h {need % 60}m
          </span>
        </p>
      </div>
    </section>
  );
}
