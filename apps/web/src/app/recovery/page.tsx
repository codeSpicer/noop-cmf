'use client';

import { useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BaselineBandChart } from '@/components/charts/BaselineBandChart';
import { ReadinessCard } from '@/components/ReadinessCard';
import { getDatabase } from '@/db/database';
import { loadRecovery } from '@/lib/db-analytics';
import type { RecoveryView } from '@/lib/db-analytics';
import { computeOvernightMetrics, percentile, sampleStdDev } from '@noop-cmf/physio-engine';
import { errorMessage } from '@/lib/errors';

const BASELINE_RHR = 50;

export default function RecoveryPage() {
  const [view, setView] = useState<RecoveryView | null>(null);
  const [rhrTrend, setRhrTrend] = useState<number[]>([]);
  const [ehrvTrend, setEhrvTrend] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const db = getDatabase();
        const data = await loadRecovery(db);
        if (cancelled) return;
        setView(data);
        // daily RHR + eHRV over last 7 days
        const [hrRows, stressRows, sleepRows] = await Promise.all([
          db.hrSamples.toArray(),
          db.stressSamples.toArray(),
          db.sleepSegments.toArray(),
        ]);
        const max = hrRows.length > 0 ? hrRows.reduce((m, h) => Math.max(m, h.timestamp), 0) : 0;
        const rhrT: number[] = [];
        const ehrvT: number[] = [];
        for (let i = 6; i >= 0; i -= 1) {
          const end = max - i * 86400000;
          const start = end - 86400000;
          const dayHr = hrRows.filter((h) => h.timestamp >= start && h.timestamp < end);
          const daySleep = sleepRows.filter((s) => s.start < end && s.end > start);
          const dayStress = stressRows.filter((s) => s.timestamp >= start && s.timestamp < end);
          if (dayHr.length === 0) continue;
          const hrVals = dayHr.map((h) => Number(h.bpm)).sort((a, b) => a - b);
          rhrT.push(Math.round(percentile(hrVals, 10)));
          const overnight = computeOvernightMetrics(dayHr, dayStress, daySleep, BASELINE_RHR);
          ehrvT.push(overnight.ehrv);
        }
        setRhrTrend(rhrT);
        setEhrvTrend(ehrvT);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Failed to load recovery.'));
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
    return <p aria-busy="true">Loading recovery…</p>;
  }
  if (!view) {
    return <p>No data yet — sync a watch.</p>;
  }
  return (
    <section aria-label="Recovery" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Readiness</p>
        <h1 className="text-2xl font-semibold text-foreground">Recovery</h1>
      </header>
      <div className="rounded-2xl border border-line bg-card p-6">
        <p data-testid="recovery-value" className="text-3xl font-semibold text-recovery">
          Recovery: {view.recovery}%
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <p data-testid="ehrv-value" className="text-muted">
            Overnight eHRV: <span className="text-foreground">{view.ehrv} ms</span>
          </p>
          <p data-testid="rhr-value" className="text-muted">
            Overnight RHR: <span className="text-foreground">{view.rhr} bpm</span>
          </p>
        </div>
      </div>
      <ReadinessCard result={view.readiness} />
      {rhrTrend.length > 0 ? (
        <ErrorBoundary>
          <div className="rounded-2xl border border-line bg-card p-4">
            <BaselineBandChart
              values={rhrTrend}
              mean={rhrTrend.reduce((a, b) => a + b, 0) / rhrTrend.length}
              stdDev={sampleStdDev(rhrTrend)}
              label="RHR baseline band"
              testId="rhr-band"
            />
          </div>
        </ErrorBoundary>
      ) : null}
      {ehrvTrend.length > 0 ? (
        <ErrorBoundary>
          <div className="rounded-2xl border border-line bg-card p-4">
            <BaselineBandChart
              values={ehrvTrend}
              mean={ehrvTrend.reduce((a, b) => a + b, 0) / ehrvTrend.length}
              stdDev={sampleStdDev(ehrvTrend)}
              label="eHRV baseline band"
              testId="ehrv-band"
            />
          </div>
        </ErrorBoundary>
      ) : null}
    </section>
  );
}
