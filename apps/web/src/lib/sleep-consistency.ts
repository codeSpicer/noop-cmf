import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { computeSleepConsistency as engineConsistency } from '@noop-cmf/physio-engine';

export async function loadSleepConsistency(
  db: NoopCmfDatabase = getDatabase(),
): Promise<number | null> {
  const rows = await db.sleepSegments.toArray();
  if (rows.length === 0) return null;
  // Group segments into sessions by contiguous blocks; use session start/end.
  // Simplest: each sleep segment's start/end as a session proxy.
  const sessions = rows.map((s) => ({ start: s.start, end: s.end }));
  // Dedupe by start to avoid double-counting segments of one night is complex;
  // use distinct start timestamps.
  const seen = new Set<number>();
  const unique = sessions.filter((s) => {
    if (seen.has(s.start)) return false;
    seen.add(s.start);
    return true;
  });
  if (unique.length < 2) return null;
  return engineConsistency(unique);
}