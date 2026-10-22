'use client';

import { useEffect, useState } from 'react';
import { computeDayStrain, type HrZone } from '@noop-cmf/physio-engine';
import { EpochMsSchema } from '@noop-cmf/types';
import { Sparkline } from '@/components/charts/Sparkline';
import { createDemoProvider, isDemoMode } from '@/lib/demo-provider';

const ZONE_COLORS: Record<HrZone, string> = {
  1: '#3a4657',
  2: '#0096ff',
  3: '#00f19f',
  4: '#ffbe0b',
  5: '#ff0055',
};

/** Strain route: logarithmic curve info, HR zone bars, TRIMP breakdown. */
export default function StrainPage() {
  const [zones, setZones] = useState<Record<HrZone, number> | null>(null);
  const [trimp, setTrimp] = useState<number | null>(null);

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
      if (hr.ok && !cancelled) {
        const breakdown = computeDayStrain(hr.value, 50, 190);
        setZones(breakdown.zoneMinutes);
        setTrimp(breakdown.trimp);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!zones || trimp === null) {
    return <p aria-busy="true">Loading strain…</p>;
  }
  const totals = Object.values(zones);
  const total = totals.reduce((sum, minutes) => sum + minutes, 0);
  return (
    <section aria-label="Strain">
      <h1 className="mb-4 text-2xl font-bold">Strain</h1>
      <p data-testid="trimp-value">Workout TRIMP: {trimp.toFixed(1)}</p>
      <div
        className="mt-4 flex h-8 w-full overflow-hidden rounded"
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
      <div className="mt-4">
        <Sparkline
          values={[total, total * 0.8, total * 1.1]}
          color="#0096FF"
          label="Zone minutes trend"
        />
      </div>
    </section>
  );
}
