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
import { loadIntensityMinutes } from '@/lib/intensity-minutes';
import type { WorkoutTrimp } from '@/lib/workout-trimp';
import { errorMessage } from '@/lib/errors';

const ZONE_COLORS: Record<HrZone, string> = {
  1: 'var(--color-muted)',
  2: 'var(--color-strain)',
  3: 'var(--color-recovery)',
  4: 'var(--color-warn)',
  5: 'var(--color-danger)',
};

export default function StrainPage() {
  const [view, setView] = useState<StrainView | null>(null);
  const [trend, setTrend] = useState<number[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutTrimp[]>([]);
  const [intensity, setIntensity] = useState<{ moderate: number; vigorous: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const db = getDatabase();
        const [data, tr, wt, im] = await Promise.all([
          loadStrain(db),
          loadStrainTrend(db, 7),
          loadWorkoutTrimp(db),
          loadIntensityMinutes(db, 7),
        ]);
        if (cancelled) return;
        setView(data);
        setTrend(tr);
        setWorkouts(wt);
        setIntensity(im);
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
    return <p>No data yet — sync a watch from the Sync page.</p>;
  }
  const zones = view.zones;
  const total = Object.values(zones).reduce((sum, minutes) => sum + minutes, 0);
  return (
    <section aria-label="Strain" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Daily load</p>
        <h1 className="text-2xl font-semibold text-foreground">Strain</h1>
        <p className="text-sm text-muted max-w-prose">
           Strain (0-21) = daily exertion from heart rate zones. TRIMP = total cardiovascular load. Zone bars show time in each HR zone (1=easy … 5=max). Intensity minutes = moderate (zone 2+) and vigorous (zone 4+) minutes.
        </p>
      </header>
      <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-6">
          <p data-testid="strain-value" className="text-muted">
            Strain: <span className="text-foreground">{view.strain.toFixed(1)}</span>
          </p>
          <p data-testid="trimp-value" className="text-muted">
            Workout TRIMP: <span className="text-foreground">{view.trimp.toFixed(1)}</span>
          </p>
          {intensity ? (
            <p data-testid="intensity-minutes" className="text-muted">
              Intensity minutes: <span className="text-foreground">{intensity.moderate} moderate, {intensity.vigorous} vigorous</span>
            </p>
          ) : null}
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
          <div className="mt-2 flex gap-2 text-xs text-muted" aria-label="HR zone legend">
            {Object.entries(ZONE_COLORS).map(([zone, color]) => (
              <span key={zone} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {zone}
              </span>
            ))}
          </div>
          {workouts.length > 0 ? (
            <div className="mt-4" data-testid="workout-trimp-list">
              <p className="mb-2 text-sm font-medium text-foreground">Workouts</p>
              <ul className="space-y-2 text-sm text-muted">
                {workouts.map((w) => (
                  <li key={w.id} className="border-t border-line pt-2 first:border-t-0 first:pt-0">
                    <p className="text-foreground">
                      {w.activityType}{' '}
                      <span className="text-muted">· {new Date(w.start).toLocaleString()}</span>
                    </p>
                    <p>
                      {w.durationMin.toFixed(1)} min · TRIMP {w.trimp.toFixed(1)} · strain{' '}
                      {w.strain.toFixed(1)}
                      {w.avgHeartRate !== null ? ` · avg ${w.avgHeartRate} bpm` : ''}
                      {w.maxHeartRate !== null ? ` · max ${w.maxHeartRate} bpm` : ''}
                      {w.hrSamples > 0 ? ` · ${String(w.hrSamples)} HR samples` : ' · no HR samples in window'}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </ErrorBoundary>
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
    </section>
  );
}
