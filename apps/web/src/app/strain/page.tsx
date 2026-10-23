'use client';

import { useEffect, useState } from 'react';
import { computeDayStrain, type HrZone } from '@noop-cmf/physio-engine';
import { EpochMsSchema } from '@noop-cmf/types';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sparkline } from '@/components/charts/Sparkline';
import { createDemoProvider, isDemoMode } from '@/lib/demo-provider';
import { errorMessage } from '@/lib/errors';

const ZONE_COLORS: Record<HrZone, string> = {
  1: '#8b98a9',
  2: '#0096ff',
  3: '#00f19f',
  4: '#ffbe0b',
  5: '#ff0055',
};

const NO_DEMO_MESSAGE = 'Connect a watch or enable demo mode (?demo=true).';

/** Strain route: logarithmic curve info, HR zone bars, TRIMP breakdown. */
export default function StrainPage() {
  const [zones, setZones] = useState<Record<HrZone, number> | null>(null);
  const [trimp, setTrimp] = useState<number | null>(null);
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
        if (cancelled) {
          return;
        }
        if (!hr.ok) {
          setError(hr.error.message);
          return;
        }
        const breakdown = computeDayStrain(hr.value, 50, 190);
        setZones(breakdown.zoneMinutes);
        setTrimp(breakdown.trimp);
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, 'Failed to load strain.'));
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
  if (!zones || trimp === null) {
    return <p aria-busy="true">Loading strain…</p>;
  }
  const totals = Object.values(zones);
  const total = totals.reduce((sum, minutes) => sum + minutes, 0);
  return (
    <section aria-label="Strain" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Daily load</p>
        <h1 className="text-2xl font-semibold text-foreground">Strain</h1>
      </header>
      <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-6">
          <p data-testid="trimp-value" className="text-muted">
            Workout TRIMP: <span className="text-foreground">{trimp.toFixed(1)}</span>
          </p>
          <div
            className="mt-4 flex h-8 w-full overflow-hidden rounded-lg"
            data-testid="zone-bars"
            role="img"
            aria-label="HR zone time bars"
          >
            {Object.entries(zones).map(([zone, minutes]) => (
              <div
                key={zone}
                title={`Zone ${zone}: ${String(minutes)} min`}
                style={{
                  width: `${String(total > 0 ? (minutes / total) * 100 : 0)}%`,
                  backgroundColor: ZONE_COLORS[Number(zone) as HrZone],
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-faint">
            <span>Zone 1</span>
            <span>Zone 5</span>
          </div>
        </div>
      </ErrorBoundary>
      <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-4">
          <Sparkline
            values={[total, total * 0.8, total * 1.1]}
            color="#0096FF"
            label="Zone minutes trend"
          />
        </div>
      </ErrorBoundary>
    </section>
  );
}
