'use client';

import { useEffect, useState } from 'react';
import type { RecoveryColorTier } from '@noop-cmf/types';
import { GaugeRing } from '@/components/gauges/GaugeRing';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sparkline } from '@/components/charts/Sparkline';
import { ReadinessChip } from '@/components/ReadinessChip';
import { HealthMonitorCard } from '@/components/HealthMonitorCard';
import { CalibrationNotice } from '@/components/CalibrationNotice';
import { getDatabase } from '@/db/database';
import { loadOverview } from '@/lib/db-analytics';
import type { OverviewView } from '@/lib/db-analytics';
import { loadHealthMetrics } from '@/lib/health-metrics';
import type { HealthMetrics } from '@/lib/health-metrics';
import { loadStrainTrend } from '@/lib/strain-trend';
import { loadStressTrend } from '@/lib/stress-trend';
import { computeEnergyScore } from '@noop-cmf/physio-engine';
import { errorMessage } from '@/lib/errors';

const RECOVERY_TIER_COLORS: Record<RecoveryColorTier, string> = {
  green: 'var(--color-recovery)',
  yellow: 'var(--color-warn)',
  red: 'var(--color-danger)',
};

export default function OverviewPage() {
  const [view, setView] = useState<OverviewView | null>(null);
  const [health, setHealth] = useState<HealthMetrics | null>(null);
  const [trend, setTrend] = useState<number[]>([]);
  const [stressTrend, setStressTrend] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const db = getDatabase();
        const [data, hm, tr, st] = await Promise.all([
          loadOverview(db),
          loadHealthMetrics(db),
          loadStrainTrend(db, 7),
          loadStressTrend(db, 14),
        ]);
        if (cancelled) return;
        setView(data);
        setHealth(hm);
        setTrend(tr);
        setStressTrend(st);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Load failed'));
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
    return <p aria-busy="true">Loading overview…</p>;
  }
  if (!view) {
    return <p>No data yet — sync a watch from the Sync page.</p>;
  }
  return (
    <section aria-label="Overview" className="space-y-6">
      <CalibrationNotice show={view.historyDays < 7 || view.overnightHrSamples < 3} />
      <header>
        <p className="text-sm text-muted">Today</p>
        <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
        <p className="text-sm text-muted max-w-prose">
           Recovery = how rested you are (1-99). Strain = today&apos;s exertion (0-21). Sleep = last night&apos;s sleep performance. Energy combines all three.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-3">
        <ErrorBoundary>
          <div className="lg:col-span-2 rounded-2xl border border-line bg-card p-6">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:flex-wrap sm:justify-start">
              <GaugeRing
                value={view.recovery}
                max={99}
                size={200}
                color={RECOVERY_TIER_COLORS[view.tier]}
                label={`Recovery ${view.tier}`}
                suffix="%"
                testId="recovery-ring"
              />
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
                <GaugeRing
                  value={view.strain}
                  max={21}
                  size={128}
                  color="var(--color-strain)"
                  label="Strain"
                  testId="strain-ring"
                />
                <GaugeRing
                  value={view.sleepPerformance}
                  max={100}
                  size={128}
                  color="var(--color-sleep)"
                  label="Sleep"
                  suffix="%"
                  testId="sleep-ring"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <p data-testid="strain-target" className="text-sm text-muted">
                Optimal strain target: <span className="text-foreground">{view.strainTarget}</span>
              </p>
              <p data-testid="energy-score" className="text-sm text-muted">
                Energy: <span className="text-foreground">{computeEnergyScore(view.recovery, 0, view.strain)}</span>/100
              </p>
              <ReadinessChip result={view.readiness} />
            </div>
            {view.overnightHrSamples < 3 ? (
              <p className="mt-3 text-sm text-amber-500">
                Insufficient overnight HR data — recovery may be unreliable.
              </p>
            ) : null}
          </div>
        </ErrorBoundary>
        <ErrorBoundary>
          <div className="rounded-2xl border border-line bg-card p-6">
            <HealthMonitorCard metrics={health} />
          </div>
        </ErrorBoundary>
      </div>
       <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-4">
          <Sparkline
            values={trend.length > 0 ? trend : [view.strain]}
            color="var(--color-strain)"
            label="7-day strain trend"
            testId="strain-spark"
          />
        </div>
      </ErrorBoundary>
      {stressTrend.length > 0 ? (
        <ErrorBoundary>
          <div className="rounded-2xl border border-line bg-card p-4">
            <p className="mb-2 text-xs text-muted">14-day stress trend</p>
            <Sparkline values={stressTrend} color="var(--color-warn)" label="14-day stress trend" testId="stress-spark" />
          </div>
        </ErrorBoundary>
      ) : null}
    </section>
  );
}
