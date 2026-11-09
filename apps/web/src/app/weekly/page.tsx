'use client';

import { useEffect, useState } from 'react';
import { getDatabase } from '@/db/database';
import { loadWeeklySummary, type WeeklySummaryView } from '@/lib/weekly-summary';
import { Sparkline } from '@/components/charts/Sparkline';

export default function WeeklyPage() {
  const [view, setView] = useState<WeeklySummaryView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const db = getDatabase();
        const data = await loadWeeklySummary(db);
        if (cancelled) return;
        setView(data);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load weekly summary');
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!loaded) return <p className="text-sm text-muted" aria-busy="true">Loading…</p>;
  if (!view || view.weeks.length === 0) {
    return <p className="text-sm text-muted">No data yet — sync a watch.</p>;
  }

  return (
    <section aria-label="Weekly summary" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Consolidated stats</p>
        <h1 className="text-2xl font-semibold text-foreground">Weekly Summary</h1>
        <p className="mt-1 text-xs text-muted">
          Strain/recovery/sleep/steps/energy per week, plus watch wear time (hours worn).
        </p>
      </header>
      {view.weeks.map((w) => (
        <div key={w.weekLabel} className="rounded-2xl border border-line bg-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{w.weekLabel}</h2>
            <span className="text-xs text-muted">{w.wearHours}h worn</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted">Avg Strain</p>
              <p className="text-lg font-semibold text-foreground">{w.avgStrain}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Avg Sleep</p>
              <p className="text-lg font-semibold text-foreground">{w.avgSleepPerf}%</p>
            </div>
            <div>
              <p className="text-xs text-muted">Total Steps</p>
              <p className="text-lg font-semibold text-foreground">{w.totalSteps.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Energy</p>
              <p className="text-lg font-semibold text-foreground">{w.avgEnergy}</p>
            </div>
          </div>
          {w.strainTrend.length > 1 ? (
            <Sparkline values={w.strainTrend} color="#f59e0b" label={`Strain trend ${w.weekLabel}`} testId={`strain-trend-${w.weekLabel}`} />
          ) : null}
        </div>
      ))}
    </section>
  );
}