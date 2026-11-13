'use client';

import { useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { getDatabase } from '@/db/database';
import { loadWorkoutTrimp, type WorkoutTrimp } from '@/lib/workout-trimp';
import { errorMessage } from '@/lib/errors';
import { exportWorkoutAsTcx } from '@/lib/strava-export';

function formatRange(start: number, end: number): string {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();
  const date = s.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  const startTime = s.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const endTime = e.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (sameDay) {
    return `${date} · ${startTime}–${endTime}`;
  }
  return `${s.toLocaleString()} – ${e.toLocaleString()}`;
}

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState<WorkoutTrimp[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const db = getDatabase();
        const data = await loadWorkoutTrimp(db);
        if (cancelled) return;
        setWorkouts(data);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Failed to load workouts.'));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleExport(workout: WorkoutTrimp): Promise<void> {
    setExportError(null);
    setExportingId(workout.id);
    try {
      const ok = await exportWorkoutAsTcx(workout.id);
      if (!ok) {
        setExportError('Workout not found for export.');
      }
    } catch (err) {
      setExportError(errorMessage(err, 'Failed to export workout.'));
    } finally {
      setExportingId(null);
    }
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (!loaded) {
    return <p aria-busy="true">Loading workouts…</p>;
  }
  if (!workouts || workouts.length === 0) {
    return (
      <section aria-label="Workouts" className="space-y-4">
        <header>
          <p className="text-sm text-muted">Activity log</p>
          <h1 className="text-2xl font-semibold text-foreground">Workouts</h1>
        </header>
        <p>No workouts yet — sync a watch from the Sync page.</p>
      </section>
    );
  }

  return (
    <section aria-label="Workouts" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Activity log</p>
        <h1 className="text-2xl font-semibold text-foreground">Workouts</h1>
        <p className="text-sm text-muted max-w-prose">
          Synced workout sessions with duration and heart-rate-based load (TRIMP/strain). HR stats are computed from samples recorded during each workout window.
        </p>
      </header>
      {exportError ? (
        <p role="alert" className="text-sm text-red-600">
          {exportError}
        </p>
      ) : null}
      <ErrorBoundary>
        <ul className="space-y-3" data-testid="workout-log">
          {workouts.map((w) => (
            <li key={w.id} className="rounded-2xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-foreground">{w.activityType}</p>
                  <p className="text-sm text-muted">{formatRange(w.start, w.end)}</p>
                </div>
                <div className="flex flex-col items-end gap-2 text-right text-sm">
                  <div>
                    <p className="font-medium text-foreground">{w.durationMin.toFixed(1)} min</p>
                    <p className="text-muted">
                      TRIMP {w.trimp.toFixed(1)} · strain {w.strain.toFixed(1)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleExport(w);
                    }}
                    disabled={exportingId === w.id}
                    aria-label={`Export ${w.activityType} workout from ${formatRange(w.start, w.end)} as TCX for Strava`}
                    className="rounded-full border border-line px-3 py-1 text-xs font-medium text-foreground hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {exportingId === w.id ? 'Exporting…' : 'Export TCX'}
                  </button>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted">Avg HR</dt>
                  <dd className="text-foreground">{w.avgHeartRate !== null ? `${String(w.avgHeartRate)} bpm` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Max HR</dt>
                  <dd className="text-foreground">{w.maxHeartRate !== null ? `${String(w.maxHeartRate)} bpm` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">HR samples</dt>
                  <dd className="text-foreground">{w.hrSamples > 0 ? String(w.hrSamples) : 'None in window'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Duration</dt>
                  <dd className="text-foreground">{w.durationMin.toFixed(1)} min</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </ErrorBoundary>
    </section>
  );
}
