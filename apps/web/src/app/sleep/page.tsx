'use client';

import { useEffect, useState } from 'react';
import { analyzeSleep, computeSleepDebt, computeSleepNeedTonight } from '@noop-cmf/physio-engine';
import { EpochMsSchema, type SleepSegment } from '@noop-cmf/types';
import { Hypnogram } from '@/components/charts/Hypnogram';
import { createDemoProvider, isDemoMode } from '@/lib/demo-provider';

/** Sleep route: hypnogram, restorative breakdown, tonight's need. */
export default function SleepPage() {
  const [segments, setSegments] = useState<readonly SleepSegment[]>([]);
  const [need, setNeed] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      if (!isDemoMode(window.location.search)) {
        setLoaded(true);
        return;
      }
      const provider = await createDemoProvider(window.location.search);
      const end = EpochMsSchema.parse(Date.UTC(2024, 0, 30));
      const start = EpochMsSchema.parse(end - 86_400_000);
      const sleep = await provider.getSleepSegments({ start, end });
      if (sleep.ok && !cancelled) {
        setSegments(sleep.value);
        const summary = analyzeSleep(sleep.value);
        const debt = computeSleepDebt(0, 450, summary.totalSleepMinutes);
        setNeed(computeSleepNeedTonight(10, debt));
        setLoaded(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || need === null) {
    return <p aria-busy="true">Loading sleep…</p>;
  }
  return (
    <section aria-label="Sleep" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Last night</p>
        <h1 className="text-2xl font-semibold text-foreground">Sleep</h1>
      </header>
      <div className="rounded-2xl border border-line bg-card p-6">
        <Hypnogram segments={segments} testId="hypnogram" />
      </div>
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
