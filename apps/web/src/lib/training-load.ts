import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { computeDayStrain } from '@noop-cmf/physio-engine';
import { latestDayRange } from './db-analytics';
import { loadResolvedUserProfile } from './user-profile';

const DAY_MS = 86_400_000;

export type TrainingStatus = 'productive' | 'maintaining' | 'overreaching' | 'detraining' | 'calibrating';

export interface TrainingLoadView {
  readonly dailyStrains: readonly number[];
  readonly acuteLoad: number;
  readonly chronicLoad: number;
  readonly acwr: number;
  readonly status: TrainingStatus;
  readonly recoveryTrend: readonly number[];
  readonly daysWithData28: number;
  readonly daysWithData7: number;
  readonly message?: string;
}

export async function loadTrainingLoad(
  db: NoopCmfDatabase = getDatabase(),
): Promise<TrainingLoadView | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const [hrRows, profile] = await Promise.all([
    db.hrSamples.toArray(),
    loadResolvedUserProfile(db),
  ]);

  const dailyStrains: number[] = [];
  const recoveryTrend: number[] = [];
  let daysWithData28 = 0;
  let daysWithData7 = 0;
  for (let i = 27; i >= 0; i -= 1) {
    const end = range.end - i * DAY_MS;
    const start = end - DAY_MS;
    const dayHr = hrRows.filter((s) => s.timestamp >= start && s.timestamp < end);
    const breakdown = computeDayStrain(dayHr, profile.restingHeartRate, profile.maxHeartRate);
    dailyStrains.push(breakdown.strain);

    if (dayHr.length > 0) {
      daysWithData28 += 1;
      if (i < 7) daysWithData7 += 1;
      const sorted = dayHr.map((h) => h.bpm).sort((a, b) => a - b);
      const idx = Math.max(0, Math.floor(sorted.length * 0.1));
      recoveryTrend.push(sorted[idx] ?? sorted[0] ?? 0);
    } else {
      recoveryTrend.push(0);
    }
  }

  const acute = dailyStrains.slice(-7).reduce((a, b) => a + b, 0);
  const chronic = dailyStrains.reduce((a, b) => a + b, 0) / 4;

  // Require enough history for a meaningful ACWR/chronic baseline.
  // <14 days with HR data in 28 days (or very sparse acute) => calibrating.
  const sufficientHistory = daysWithData28 >= 14 && daysWithData7 >= 3 && chronic > 0.5;

  const acwr = chronic > 0 ? acute / chronic : 1;

  const recentRhr = recoveryTrend.slice(-3).filter((v) => v > 0);
  const earlyRhr = recoveryTrend.slice(0, 3).filter((v) => v > 0);
  const rhrImproving =
    recentRhr.length > 0 && earlyRhr.length > 0
      ? recentRhr.reduce((a, b) => a + b, 0) / recentRhr.length <
        earlyRhr.reduce((a, b) => a + b, 0) / earlyRhr.length
      : true;

  let status: TrainingStatus;
  let message: string | undefined;
  if (!sufficientHistory) {
    status = 'calibrating';
    message = 'Need about 2–4 weeks of consistent synced HR data for reliable training load and ACWR. Keep syncing to calibrate.';
  } else if (acwr < 0.8) {
    status = 'detraining';
  } else if (acwr > 1.5) {
    status = 'overreaching';
  } else if (acwr > 1.3 && !rhrImproving) {
    status = 'overreaching';
  } else if (acwr >= 0.8 && acwr <= 1.3 && rhrImproving) {
    status = 'productive';
  } else {
    status = 'maintaining';
  }

  return {
    dailyStrains,
    acuteLoad: Math.round(acute * 10) / 10,
    chronicLoad: Math.round(chronic * 10) / 10,
    acwr: Math.round(acwr * 100) / 100,
    status,
    recoveryTrend,
    daysWithData28,
    daysWithData7,
    ...(message ? { message } : {}),
  };
}
