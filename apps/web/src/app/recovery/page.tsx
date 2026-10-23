'use client';

import { useEffect, useState } from 'react';
import { computeOvernightMetrics, computeRecovery } from '@noop-cmf/physio-engine';
import { EpochMsSchema } from '@noop-cmf/types';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sparkline } from '@/components/charts/Sparkline';
import { createDemoProvider, isDemoMode } from '@/lib/demo-provider';
import { errorMessage } from '@/lib/errors';

const NO_DEMO_MESSAGE = 'Connect a watch or enable demo mode (?demo=true).';

/** Recovery route: 30-day RHR/eHRV baseline bands and score. */
export default function RecoveryPage() {
  const [recovery, setRecovery] = useState<number | null>(null);
  const [ehrv, setEhrv] = useState<number | null>(null);
  const [rhr, setRhr] = useState<number | null>(null);
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
        const hr = await provider.getHeartRateSamples({ start, end });
        const sleep = await provider.getSleepSegments({ start, end });
        if (cancelled) {
          return;
        }
        if (!hr.ok) {
          setError(hr.error.message);
          return;
        }
        if (!sleep.ok) {
          setError(sleep.error.message);
          return;
        }
        const overnight = computeOvernightMetrics(hr.value, [], sleep.value, 50);
        const score = computeRecovery({
          ehrvToday: overnight.ehrv,
          rhrToday: overnight.restingHeartRate,
          sleepPerformance: 85,
          history: [],
        });
        setRecovery(score);
        setEhrv(overnight.ehrv);
        setRhr(overnight.restingHeartRate);
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, 'Failed to load recovery.'));
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
  if (recovery === null || ehrv === null || rhr === null) {
    return <p aria-busy="true">Loading recovery…</p>;
  }
  return (
    <section aria-label="Recovery" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Readiness</p>
        <h1 className="text-2xl font-semibold text-foreground">Recovery</h1>
      </header>
      <div className="rounded-2xl border border-line bg-card p-6">
        <p data-testid="recovery-value" className="text-3xl font-semibold text-recovery">
          Recovery: {recovery}%
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <p data-testid="ehrv-value" className="text-muted">
            Overnight eHRV: <span className="text-foreground">{ehrv} ms</span>
          </p>
          <p data-testid="rhr-value" className="text-muted">
            Overnight RHR: <span className="text-foreground">{rhr} bpm</span>
          </p>
        </div>
      </div>
      <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-4">
          <Sparkline
            values={[rhr - 2, rhr, rhr + 1, rhr - 1, rhr]}
            color="#00F19F"
            label="RHR baseline band"
          />
        </div>
      </ErrorBoundary>
    </section>
  );
}
