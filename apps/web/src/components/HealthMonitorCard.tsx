'use client';

import type { HealthMetrics } from '@/lib/health-metrics';

export interface HealthMonitorCardProps {
  readonly metrics: HealthMetrics | null;
  readonly loading?: boolean;
}

export function HealthMonitorCard({ metrics, loading = false }: HealthMonitorCardProps) {
  if (loading || !metrics) {
    return <p aria-busy="true">Loading health monitor…</p>;
  }
  const sleepH = Math.floor(metrics.sleepMinutes / 60);
  const sleepM = metrics.sleepMinutes % 60;
  const tiles = [
    { testId: 'hm-rhr', label: 'RHR', value: `${String(metrics.restingHeartRate)} bpm` },
    { testId: 'hm-stress', label: 'Stress', value: String(metrics.stress) },
    { testId: 'hm-spo2', label: 'SpO2', value: `${String(metrics.spo2)}%` },
    { testId: 'hm-sleep', label: 'Sleep', value: `${String(sleepH)}h ${String(sleepM)}m` },
    { testId: 'hm-steps', label: 'Steps', value: String(metrics.steps) },
  ];
  return (
    <div data-testid="health-monitor" className="rounded-2xl border border-line bg-card p-6">
      <p className="mb-3 text-sm text-muted">Health monitor</p>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <div key={tile.testId} className="min-w-0 rounded-lg bg-void p-3 text-center">
            <p data-testid={tile.testId} className="text-lg font-semibold text-foreground">
              {tile.value}
            </p>
            <p className="text-xs text-muted">{tile.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}