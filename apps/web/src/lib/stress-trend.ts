import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';

const DAY_MS = 86_400_000;

export async function loadStressTrend(
  db: NoopCmfDatabase = getDatabase(),
  days = 14,
): Promise<number[]> {
  const stressRows = await db.stressSamples.toArray();
  if (stressRows.length === 0) return [];
  const max = stressRows.reduce((m, s) => Math.max(m, s.timestamp), 0);
  const result: number[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const end = max - i * DAY_MS;
    const start = end - DAY_MS;
    const dayStress = stressRows.filter((s) => s.timestamp >= start && s.timestamp < end);
    if (dayStress.length === 0) {
      result.push(0);
      continue;
    }
    const avg = dayStress.reduce((sum, s) => sum + s.stress, 0) / dayStress.length;
    result.push(Math.round(avg));
  }
  return result;
}