'use client';

import { useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Hypnogram } from '@/components/charts/Hypnogram';
import { getDatabase } from '@/db/database';
import { loadSleep } from '@/lib/db-analytics';
import type { SleepView } from '@/lib/db-analytics';
import { loadSleepConsistency } from '@/lib/sleep-consistency';
import { loadSleepCoach, type SleepCoachView } from '@/lib/sleep-coach';
import { errorMessage } from '@/lib/errors';
import { isDemoMode } from '@/lib/demo-provider';
import { enableSimulatorMode } from '@/lib/simulator-mode';

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h)}h ${String(mm)}m`;
}

export default function SleepPage() {
  const [view, setView] = useState<SleepView | null>(null);
  const [consistency, setConsistency] = useState<number | null>(null);
  const [coach, setCoach] = useState<SleepCoachView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const db = getDatabase();
        if (typeof window !== 'undefined' && isDemoMode(window.location.search)) {
          await enableSimulatorMode('endurance-runner', db);
        }
        const [data, c, coachData] = await Promise.all([loadSleep(db), loadSleepConsistency(db), loadSleepCoach(db)]);
        if (cancelled) return;
        setView(data);
        setConsistency(c);
        setCoach(coachData);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Failed to load sleep.'));
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
    return <p aria-busy="true">Loading sleep…</p>;
  }
  if (!view) {
    return <p>No data yet — sync a watch from the Sync page.</p>;
  }
  const asleepMin = Math.round(view.summary.totalSleepMinutes);
  const inBedMin = Math.round(view.summary.timeInBedMinutes);
  return (
    <section aria-label="Sleep" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Last night</p>
        <h1 className="text-2xl font-semibold text-foreground">Sleep</h1>
        <p className="text-sm text-muted max-w-prose">
          Showing your primary/main sleep session from the last 24 hours (not every sleep/rest period).
          Hypnogram: lighter purple = light sleep, darker purple = deep sleep, purple = REM, gray = awake.
          Sleep need tonight = 7.5h baseline + extra for today&apos;s strain and sleep debt. Consistency = how regular
          your bed/wake times are (0-100).
        </p>
      </header>
      <ErrorBoundary>
        <div className="rounded-2xl border border-line bg-card p-6">
          <Hypnogram segments={view.segments} testId="hypnogram" />
          {view.sessionStart !== null && view.sessionEnd !== null ? (
            <p className="mt-3 text-sm text-muted" data-testid="sleep-session-window">
              Main sleep session: <span className="text-foreground">{formatDateTime(view.sessionStart)} → {formatDateTime(view.sessionEnd)}</span>
              {view.otherSessionsCount > 0 ? (
                <span> · {String(view.otherSessionsCount)} other sleep/rest period{view.otherSessionsCount === 1 ? '' : 's'} in last 24h not included</span>
              ) : null}
            </p>
          ) : null}
          {view.notes.length > 0 ? (
            <div className="mt-2 space-y-1">
              {view.notes.map((note, i) => (
                <p key={i} className="text-xs text-amber-500">
                  {note}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </ErrorBoundary>
      <div className="rounded-2xl border border-line bg-card p-6 space-y-1">
        <p data-testid="sleep-total" className="text-muted">
          Total sleep: <span className="text-foreground">{asleepMin} min</span>{' '}
          <span className="text-xs text-muted">({formatDuration(asleepMin)} asleep)</span>
        </p>
        <p className="text-muted">
          Time in bed (session span): <span className="text-foreground">{inBedMin} min</span>{' '}
          <span className="text-xs text-muted">({formatDuration(inBedMin)})</span>
        </p>
        <p className="text-muted">
          Sleep performance: <span className="text-foreground">{view.summary.sleepPerformance}%</span>{' '}
          <span className="text-xs text-muted">(efficiency {Math.round(view.summary.sleepEfficiency)}%, restorative {Math.round(view.summary.restorativeShare * 100)}%)</span>
        </p>
        <p data-testid="sleep-need" className="text-muted">
          Tonight&apos;s sleep need:{' '}
          <span className="text-foreground">
            {Math.round(view.need / 60)}h {view.need % 60}m
          </span>
        </p>
        {consistency !== null ? (
          <p data-testid="sleep-consistency" className="text-muted">
            Sleep consistency: <span className="text-foreground">{consistency}/100</span>
          </p>
        ) : null}
        {coach ? (
          <div className="mt-3 border-t border-line pt-3" data-testid="sleep-coach">
            <p className="text-muted">
              Recommended bedtime: <span className="text-foreground">{coach.recommendedBedtime}</span>
            </p>
            <p className="text-xs text-muted">
              Sleep need {Math.round(coach.sleepNeedMinutes / 60)}h{coach.sleepNeedMinutes % 60}m · wake {coach.wakeTime} · debt {coach.sleepDebtMinutes} min
            </p>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Note: If the watch recorded sleep stages while not worn (e.g. evening rest), totals can differ from the watch&apos;s
        main-sleep summary. Gaps/off-wrist periods may not always be explicitly marked in synced data.
      </p>
    </section>
  );
}
