'use client';

import { useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BaselineBandChart } from '@/components/charts/BaselineBandChart';
import { Sparkline } from '@/components/charts/Sparkline';
import { ReadinessCard } from '@/components/ReadinessCard';
import { CalibrationNotice } from '@/components/CalibrationNotice';
import { getDatabase } from '@/db/database';
import { loadRecovery, loadRhrTrend } from '@/lib/db-analytics';
import type { RecoveryView } from '@/lib/db-analytics';
import { computeOvernightMetrics, percentile, sampleStdDev } from '@noop-cmf/physio-engine';
import { errorMessage } from '@/lib/errors';

const BASELINE_RHR = 50;

export default function RecoveryPage() {
  const [view, setView] = useState<RecoveryView | null>(null);
  const [rhrTrend, setRhrTrend] = useState<number[]>([]);
  const [ehrvTrend, setEhrvTrend] = useState<number[]>([]);
  const [rhr28, setRhr28] = useState<number[]>([]);
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
        const rhrTrend28 = await loadRhrTrend(db);
        setRhr28([...rhrTrend28]);
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
    return <p>No data yet — sync a watch from the Sync page.</p>;
  }
  return (
    <section aria-label="Recovery" className="space-y-4">
      <CalibrationNotice show={view.historyDays < 7 || view.overnightHrSamples < 3} />
      <header>
        <p className="text-sm text-muted">Readiness</p>
        <h1 className="text-2xl font-semibold text-foreground">Recovery</h1>
        <p className="text-sm text-muted max-w-prose">
           Recovery (1-99) = overnight HR + stress + sleep vs your 30-day baseline. Readiness decays after workouts and counts down to &quot;ready to go hard&quot;. Baseline bands show your normal RHR/eHRV range (mean ± 1 std dev).
        </p>
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
        {view.overnightHrSamples < 3 ? (
          <p className="mt-3 text-sm text-amber-500">
            Insufficient overnight HR data ({String(view.overnightHrSamples)} samples) — recovery and overnight metrics may be unreliable. Wear the watch snugly with HR monitoring on during sleep.
          </p>
        ) : null}
        {view.historyDays < 3 ? (
          <p className="mt-2 text-sm text-muted">
            Baseline warming up: {String(view.historyDays)} day{view.historyDays === 1 ? '' : 's'} of overnight history (3+ recommended).
          </p>
        ) : null}
      </div>
      <ReadinessCard result={view.readiness} />
      {rhrTrend.length >= 2 ? (
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
      {ehrvTrend.length >= 2 ? (
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
      <div className="rounded-2xl border border-line bg-card p-4">
        <p className="mb-2 text-xs text-muted">Resting HR trend (28 days)</p>
        {rhr28.length >= 4 ? (
          <Sparkline values={rhr28} color="#22c55e" label="Resting HR trend" testId="rhr-trend" />
        ) : (
          <p className="text-xs text-muted">Need 4+ days of data for trend.</p>
        )}
      </div>
    </section>
  );
}
