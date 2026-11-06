'use client';

import type { ReadinessResult } from '@noop-cmf/physio-engine';

export interface ReadinessCardProps {
  readonly result: ReadinessResult | null;
  readonly loading?: boolean;
}

function formatCountdown(minutes: number): string {
  if (minutes <= 0) {
    return 'Recovered';
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours <= 0) {
    return `Ready in ~${String(mins)}m`;
  }
  if (mins === 0) {
    return `Ready in ~${String(hours)}h`;
  }
  return `Ready in ~${String(hours)}h ${String(mins)}m`;
}

/** Full readiness card for the Recovery page. */
export function ReadinessCard({ result, loading = false }: ReadinessCardProps) {
  if (loading || !result) {
    return <p aria-busy="true">Loading readiness…</p>;
  }
  // Progress bar fill mirrors the readiness percentage.
  const fill = result.readinessPercent;

  return (
    <div
      data-testid="readiness-card"
      className="rounded-2xl border border-line bg-card p-6 space-y-3"
    >
      <p data-testid="readiness-value" className="text-3xl font-semibold text-recovery">
        Readiness: {result.readinessPercent}%
      </p>
      <p data-testid="readiness-countdown" className="text-sm text-muted">
        {formatCountdown(result.minutesToReady)}
      </p>
      <div
        data-testid="readiness-progress"
        className="h-2 w-full rounded-full bg-line overflow-hidden"
        role="progressbar"
        aria-valuenow={result.readinessPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-recovery"
          style={{ width: `${String(fill)}%` }}
        />
      </div>
      {result.recovered ? (
        <p data-testid="readiness-recovered" className="text-xs text-muted">
          Fully recovered
        </p>
      ) : null}
    </div>
  );
}