'use client';

import { useEffect, useState } from 'react';
import { type HrZone } from '@noop-cmf/physio-engine';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sparkline } from '@/components/charts/Sparkline';
import { getDatabase } from '@/db/database';
import { loadStrain } from '@/lib/db-analytics';
import type { StrainView } from '@/lib/db-analytics';
import { loadStrainTrend } from '@/lib/strain-trend';
import { loadWorkoutTrimp } from '@/lib/workout-trimp';
import type { WorkoutTrimp } from '@/lib/workout-trimp';
import { errorMessage } from '@/lib/errors';

const ZONE_COLORS: Record<HrZone, string> = {
  1: '#8b98a9',
  2: '#0096ff',
  3: '#00f19f',
  4: '#ffbe0b',
  5: '#ff0055',
};

export default function StrainPage() {
  const [view, setView] = useState<StrainView | null>(null);
  const [trend, setTrend] = useState<number[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutTrimp[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const db = getDatabase();
        const [data, tr, wt] = await Promise.all([
          loadStrain(db),
          loadStrainTrend(db, 7),
          loadWorkoutTrimp(db),
        ]);
        if (cancelled) return;
        setView(data);
        setTrend(tr);
        setWorkouts(wt);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Failed to load strain.'));
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
    return <p aria-busy="true">Loading strain…</p>;
  }
  if (!view) {
    return <p>No data yet — sync a watch.</p>;
  }
  const zones = view.zones;
  const total = Object.values(zones).reduce((sum, minutes) => sum + minutes, 0);
  return (
    <section aria-label="Strain" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Daily load</p>
        <h1 className="text-2xl font-semibold text-foreground">Strain</h1>
      </header>
      <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-6">
          <p data-testid="strain-value" className="text-muted">
            Strain: <span className="text-foreground">{view.strain.toFixed(1)}</span>
          </p>
          <p data-testid="trimp-value" className="text-muted">
            Workout TRIMP: <span className="text-foreground">{view.trimp.toFixed(1)}</span>
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
          {workouts.length > 0 ? (
            <ul className="mt-4 space-y-1 text-sm text-muted" data-testid="workout-trimp-list">
              {workouts.map((w) => (
                <li key={w.id}>
                  {w.activityType}: TRIMP {w.trimp.toFixed(1)}, strain {w.strain.toFixed(1)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
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
