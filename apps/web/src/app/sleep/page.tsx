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
    <section aria-label="Sleep">
      <h1 className="mb-4 text-2xl font-bold">Sleep</h1>
      <Hypnogram segments={segments} testId="hypnogram" />
      <p data-testid="sleep-need" className="mt-4">
        Tonight&apos;s sleep need: {Math.round(need / 60)}h {need % 60}m
      </p>
    </section>
  );
}
