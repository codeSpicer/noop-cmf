'use client';

import { useEffect, useState } from 'react';
import {
  computeDayStrain,
  computeRecovery,
  computeStrainTarget,
  analyzeSleep,
} from '@noop-cmf/physio-engine';
import { EpochMsSchema, getRecoveryTier } from '@noop-cmf/types';
import type { RecoveryColorTier } from '@noop-cmf/types';
import { GaugeRing } from '@/components/gauges/GaugeRing';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sparkline } from '@/components/charts/Sparkline';
import { createDemoProvider, isDemoMode } from '@/lib/demo-provider';
import { errorMessage } from '@/lib/errors';

const RECOVERY_TIER_COLORS: Record<RecoveryColorTier, string> = {
  green: '#00F19F',
  yellow: '#FFBE0B',
  red: '#FF0055',
};

interface OverviewStats {
  strain: number;
  recovery: number;
  sleepPerformance: number;
  strainTarget: number;
  tier: RecoveryColorTier;
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
          setError(errorMessage(err, 'Load failed'));
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
    <section aria-label="Overview" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Today</p>
        <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
      </header>
      <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-6">
          <div className="flex flex-wrap items-center justify-center gap-6">
            <GaugeRing
              value={stats.recovery}
              max={99}
              color={RECOVERY_TIER_COLORS[stats.tier]}
              label={`Recovery ${stats.tier}`}
              suffix="%"
              testId="recovery-ring"
            />
            <GaugeRing
              value={stats.strain}
              max={21}
              color="#0096FF"
              label="Strain"
              testId="strain-ring"
            />
            <GaugeRing
              value={stats.sleepPerformance}
              max={100}
              color="#7B61FF"
              label="Sleep"
              suffix="%"
              testId="sleep-ring"
            />
          </div>
          <p data-testid="strain-target" className="mt-6 text-center text-sm text-muted">
            Optimal strain target: <span className="text-foreground">{stats.strainTarget}</span>
          </p>
        </div>
      </ErrorBoundary>
      <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-4">
          <Sparkline
            values={[8, 12, 9, 14, 11, 13, stats.strain]}
            color="#0096FF"
            label="7-day strain trend"
            testId="strain-spark"
          />
        </div>
      </ErrorBoundary>
    </section>
  );
}
