import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { computeDayStrain } from '@noop-cmf/physio-engine';
import { latestDayRange } from './db-analytics';

const DAY_MS = 86_400_000;
const BASELINE_RHR = 50;
const BASELINE_HR_MAX = 190;

export type TrainingStatus = 'productive' | 'maintaining' | 'overreaching' | 'detraining';

export interface TrainingLoadView {
  readonly dailyStrains: readonly number[];
  readonly acuteLoad: number;
  readonly chronicLoad: number;
  readonly acwr: number;
  readonly status: TrainingStatus;
  readonly recoveryTrend: readonly number[];
}

export async function loadTrainingLoad(
  db: NoopCmfDatabase = getDatabase(),
): Promise<TrainingLoadView | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const hrRows = await db.hrSamples.toArray();

  const dailyStrains: number[] = [];
  const recoveryTrend: number[] = [];
  for (let i = 27; i >= 0; i -= 1) {
    const end = range.end - i * DAY_MS;
    const start = end - DAY_MS;
    const dayHr = hrRows.filter((s) => s.timestamp >= start && s.timestamp < end);
    const breakdown = computeDayStrain(dayHr, BASELINE_RHR, BASELINE_HR_MAX);
    dailyStrains.push(breakdown.strain);

    if (dayHr.length > 0) {
      const sorted = dayHr.map((h) => h.bpm).sort((a, b) => a - b);
      const idx = Math.max(0, Math.floor(sorted.length * 0.1));
      recoveryTrend.push(sorted[idx] ?? sorted[0] ?? 0);
    } else {
      recoveryTrend.push(0);
    }
  }

  const acute = dailyStrains.slice(-7).reduce((a, b) => a + b, 0);
  const chronic = dailyStrains.reduce((a, b) => a + b, 0) / 4;
  const acwr = chronic > 0 ? acute / chronic : 1;

  const recentRhr = recoveryTrend.slice(-3).filter((v) => v > 0);
  const earlyRhr = recoveryTrend.slice(0, 3).filter((v) => v > 0);
  const rhrImproving =
    recentRhr.length > 0 && earlyRhr.length > 0
      ? recentRhr.reduce((a, b) => a + b, 0) / recentRhr.length <
        earlyRhr.reduce((a, b) => a + b, 0) / earlyRhr.length
      : true;

  let status: TrainingStatus;
  if (acwr < 0.8) status = 'detraining';
  else if (acwr > 1.5) status = 'overreaching';
  else if (acwr > 1.3 && !rhrImproving) status = 'overreaching';
  else if (acwr >= 0.8 && acwr <= 1.3 && rhrImproving) status = 'productive';
  else status = 'maintaining';

  return {
    dailyStrains,
    acuteLoad: Math.round(acute * 10) / 10,
    chronicLoad: Math.round(chronic * 10) / 10,
    acwr: Math.round(acwr * 100) / 100,
    status,
    recoveryTrend,
  };
}