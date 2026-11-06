'use client';

import { useEffect, useState } from 'react';
import type { RecoveryColorTier } from '@noop-cmf/types';
import { GaugeRing } from '@/components/gauges/GaugeRing';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sparkline } from '@/components/charts/Sparkline';
import { ReadinessChip } from '@/components/ReadinessChip';
import { HealthMonitorCard } from '@/components/HealthMonitorCard';
import { getDatabase } from '@/db/database';
import { loadOverview } from '@/lib/db-analytics';
import type { OverviewView } from '@/lib/db-analytics';
import { loadHealthMetrics } from '@/lib/health-metrics';
import type { HealthMetrics } from '@/lib/health-metrics';
import { loadStrainTrend } from '@/lib/strain-trend';
import { computeEnergyScore } from '@noop-cmf/physio-engine';
import { errorMessage } from '@/lib/errors';

const RECOVERY_TIER_COLORS: Record<RecoveryColorTier, string> = {
  green: '#00F19F',
  yellow: '#FFBE0B',
  red: '#FF0055',
};

export default function OverviewPage() {
  const [view, setView] = useState<OverviewView | null>(null);
  const [health, setHealth] = useState<HealthMetrics | null>(null);
  const [trend, setTrend] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const db = getDatabase();
        const [data, hm, tr] = await Promise.all([
          loadOverview(db),
          loadHealthMetrics(db),
          loadStrainTrend(db, 7),
        ]);
        if (cancelled) return;
        setView(data);
        setHealth(hm);
        setTrend(tr);
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
    return <p>No data yet — sync a watch.</p>;
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
              value={view.recovery}
              max={99}
              color={RECOVERY_TIER_COLORS[view.tier]}
              label={`Recovery ${view.tier}`}
              suffix="%"
              testId="recovery-ring"
            />
            <GaugeRing
              value={view.strain}
              max={21}
              color="#0096FF"
              label="Strain"
              testId="strain-ring"
            />
            <GaugeRing
              value={view.sleepPerformance}
              max={100}
              color="#7B61FF"
              label="Sleep"
              suffix="%"
              testId="sleep-ring"
            />
          </div>
          <p data-testid="strain-target" className="mt-6 text-center text-sm text-muted">
            Optimal strain target: <span className="text-foreground">{view.strainTarget}</span>
          </p>
          <p data-testid="energy-score" className="mt-2 text-center text-sm text-muted">
            Energy: <span className="text-foreground">{computeEnergyScore(view.recovery, 0, view.strain)}</span>/100
          </p>
          <div className="mt-4 flex justify-center">
            <ReadinessChip result={view.readiness} />
          </div>
        </div>
      </ErrorBoundary>
      <ErrorBoundary>
        <HealthMonitorCard metrics={health} />
      </ErrorBoundary>
      <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-4">
          <Sparkline
            values={trend.length > 0 ? trend : [view.strain]}
            color="#0096FF"
            label="7-day strain trend"
            testId="strain-spark"
          />
        </div>
      </ErrorBoundary>
    </section>
  );
}
