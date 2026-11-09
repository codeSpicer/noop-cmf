import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { loadSleep } from './db-analytics';
import { computeSleepDebt } from "@noop-cmf/physio-engine";

const DEFAULT_WAKE_MINUTES = 7 * 60; // 07:00

export interface SleepCoachView {
  readonly recommendedBedtime: string;
  readonly sleepNeedMinutes: number;
  readonly sleepDebtMinutes: number;
  readonly wakeTime: string;
}

function minutesToHHMM(mins: number): string {
  const normalized = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export async function loadSleepCoach(
  db: NoopCmfDatabase = getDatabase(),
  wakeMinutes: number = DEFAULT_WAKE_MINUTES,
): Promise<SleepCoachView | null> {
  const view = await loadSleep(db);
  if (!view) return null;
  const sleepNeed = view.need;
  const debt = computeSleepDebt(0, 450, view.summary.totalSleepMinutes);
  const bedtimeMinutes = wakeMinutes - sleepNeed;
  return {
    recommendedBedtime: minutesToHHMM(bedtimeMinutes),
    sleepNeedMinutes: sleepNeed,
    sleepDebtMinutes: debt,
    wakeTime: minutesToHHMM(wakeMinutes),
  };
}