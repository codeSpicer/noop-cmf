'use client';

import { useEffect, useState } from 'react';
import { computeOvernightMetrics, computeRecovery } from '@noop-cmf/physio-engine';
import { EpochMsSchema } from '@noop-cmf/types';
import { Sparkline } from '@/components/charts/Sparkline';
import { createDemoProvider, isDemoMode } from '@/lib/demo-provider';

/** Recovery route: 30-day RHR/eHRV baseline bands and score. */
export default function RecoveryPage() {
  const [recovery, setRecovery] = useState<number | null>(null);
  const [ehrv, setEhrv] = useState<number | null>(null);
  const [rhr, setRhr] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      if (!isDemoMode(window.location.search)) {
        return;
      }
      const provider = await createDemoProvider(window.location.search);
      const end = EpochMsSchema.parse(Date.UTC(2024, 0, 30));
      const start = EpochMsSchema.parse(end - 86_400_000);
      const hr = await provider.getHeartRateSamples({ start, end });
      const sleep = await provider.getSleepSegments({ start, end });
      if (hr.ok && sleep.ok && !cancelled) {
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
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (recovery === null || ehrv === null || rhr === null) {
    return <p aria-busy="true">Loading recovery…</p>;
  }
  return (
    <section aria-label="Recovery">
      <h1 className="mb-4 text-2xl font-bold">Recovery</h1>
      <p data-testid="recovery-value">Recovery: {recovery}%</p>
      <p data-testid="ehrv-value">Overnight eHRV: {ehrv} ms</p>
      <p data-testid="rhr-value">Overnight RHR: {rhr} bpm</p>
      <div className="mt-4">
        <Sparkline
          values={[rhr - 2, rhr, rhr + 1, rhr - 1, rhr]}
          color="#00F19F"
          label="RHR baseline band"
        />
      </div>
    </section>
  );
}
