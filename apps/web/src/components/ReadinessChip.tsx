'use client';

import type { ReadinessResult } from '@noop-cmf/physio-engine';

export interface ReadinessChipProps {
  readonly result: ReadinessResult | null;
  readonly loading?: boolean;
}

/** Compact readiness chip for the Overview page. */
export function ReadinessChip({ result, loading = false }: ReadinessChipProps) {
  if (loading || !result) {
    return <span data-testid="readiness-chip">Readiness: …</span>;
  }
  const pct = Number(result.readinessPercent);
  const label = result.recovered
    ? `Readiness ${String(pct)}%`
    : `Readiness ${String(pct)}% · ${String(Math.round(result.minutesToReady / 60))}h to ready`;
  return (
    <span
      data-testid="readiness-chip"
      className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-sm text-foreground"
    >
      {label}
    </span>
  );
}