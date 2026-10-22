'use client';

import { useEffect, useState } from 'react';
import {
  computeDayStrain,
  computeRecovery,
  computeStrainTarget,
  analyzeSleep,
} from '@noop-cmf/physio-engine';
import { EpochMsSchema, getRecoveryTier } from '@noop-cmf/types';
import { GaugeRing } from '@/components/gauges/GaugeRing';
import { Sparkline } from '@/components/charts/Sparkline';
import { createDemoProvider, isDemoMode } from '@/lib/demo-provider';

interface OverviewStats {
  strain: number;
  recovery: number;
  sleepPerformance: number;
  strainTarget: number;
  tier: string;
}

/** Overview route: triple SVG gauge rings + 7-day sparklines (demo data). */
export default function OverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const search = window.location.search;
        if (!isDemoMode(search)) {
          setError('Connect a watch or enable demo mode (?demo=true).');
          return;
        }
        const provider = await createDemoProvider(search);
        const dayMs = 86_400_000;
        const end = EpochMsSchema.parse(Date.UTC(2024, 0, 30));
        const start = EpochMsSchema.parse(end - dayMs);
        const range = { start, end };
        const hr = await provider.getHeartRateSamples(range);
        const sleep = await provider.getSleepSegments(range);
        if (!hr.ok || !sleep.ok) {
          setError('Demo data unavailable.');
          return;
        }
        const breakdown = computeDayStrain(hr.value, 50, 190);
        const summary = analyzeSleep(sleep.value);
        const recovery = computeRecovery({
          ehrvToday: 100,
          rhrToday: 50,
          sleepPerformance: summary.sleepPerformance,
          history: [],
        });
        if (!cancelled) {
          setStats({
            strain: breakdown.strain,
            recovery,
            sleepPerformance: summary.sleepPerformance,
            strainTarget: computeStrainTarget(recovery),
            tier: getRecoveryTier(recovery),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Load failed');
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
  if (!stats) {
    return <p aria-busy="true">Loading overview…</p>;
  }
  return (
    <section aria-label="Overview">
      <h1 className="mb-4 text-2xl font-bold">Overview</h1>
      <div className="flex flex-wrap gap-6">
        <GaugeRing
          value={stats.strain}
          max={21}
          color="#0096FF"
          label="Strain"
          testId="strain-ring"
        />
        <GaugeRing
          value={stats.recovery}
          max={99}
          color="#00F19F"
          label={`Recovery ${stats.tier}`}
          testId="recovery-ring"
        />
        <GaugeRing
          value={stats.sleepPerformance}
          max={100}
          color="#7B61FF"
          label="Sleep"
          testId="sleep-ring"
        />
      </div>
      <p data-testid="strain-target" className="mt-4">
        Optimal strain target: {stats.strainTarget}
      </p>
      <div className="mt-4">
        <Sparkline
          values={[8, 12, 9, 14, 11, 13, stats.strain]}
          color="#0096FF"
          label="7-day strain trend"
          testId="strain-spark"
        />
      </div>
    </section>
  );
}
