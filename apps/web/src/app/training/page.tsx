'use client';

import { useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sparkline } from '@/components/charts/Sparkline';
import { getDatabase } from '@/db/database';
import { loadTrainingLoad, type TrainingLoadView, type TrainingStatus } from '@/lib/training-load';
import { errorMessage } from '@/lib/errors';

const STATUS_COLORS: Record<TrainingStatus, string> = {
  productive: 'text-recovery',
  maintaining: 'text-foreground',
  overreaching: 'text-red-400',
  detraining: 'text-muted',
};

const STATUS_DESC: Record<TrainingStatus, string> = {
  productive: 'You are adapting well — keep it up.',
  maintaining: 'Load is stable; fitness is holding.',
  overreaching: 'Load is too high relative to recovery — consider rest.',
  detraining: 'Load is too low — risk of losing fitness.',
};

export default function TrainingPage() {
  const [view, setView] = useState<TrainingLoadView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const db = getDatabase();
        const data = await loadTrainingLoad(db);
        if (cancelled) return;
        setView(data);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Failed to load training load.'));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!loaded) return <p aria-busy="true">Loading training load…</p>;
  if (!view) return <p>No data yet — sync a watch from the Sync page.</p>;

  return (
    <section aria-label="Training load" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Training load</p>
        <h1 className="text-2xl font-semibold text-foreground">Training Status</h1>
        <p className="text-sm text-muted max-w-prose">
          ACWR = acute (7-day) load ÷ chronic (28-day) load. Status combines load ratio with recovery trend (resting HR). Productive = adapting; overreaching = too much; detraining = too little.
        </p>
      </header>
      <div className="rounded-2xl border border-line bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">ACWR</p>
          <p className={`text-2xl font-semibold ${STATUS_COLORS[view.status]}`}>{view.acwr.toFixed(2)}</p>
        </div>
        <p className={`text-sm font-semibold ${STATUS_COLORS[view.status]}`}>
          {view.status.charAt(0).toUpperCase() + view.status.slice(1)}
        </p>
        <p className="text-xs text-muted">{STATUS_DESC[view.status]}</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted">Acute load (7d)</p>
            <p className="text-lg font-semibold text-foreground">{view.acuteLoad}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Chronic load (28d/4)</p>
            <p className="text-lg font-semibold text-foreground">{view.chronicLoad}</p>
          </div>
        </div>
      </div>
      <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="mb-2 text-xs text-muted">28-day strain trend</p>
          <Sparkline values={view.dailyStrains} color="var(--color-strain)" label="28-day strain trend" testId="training-load-spark" />
        </div>
      </ErrorBoundary>
      <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="mb-2 text-xs text-muted">Recovery trend (RHR, lower = better)</p>
          <Sparkline values={view.recoveryTrend.filter((v) => v > 0)} color="#22c55e" label="Recovery trend" testId="recovery-trend-spark" />
        </div>
      </ErrorBoundary>
    </section>
  );
}