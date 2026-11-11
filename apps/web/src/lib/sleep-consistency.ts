import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { computeSleepConsistency as engineConsistency } from '@noop-cmf/physio-engine';

export async function loadSleepConsistency(
  db: NoopCmfDatabase = getDatabase(),
): Promise<number | null> {
  const rows = await db.sleepSegments.toArray();
  if (rows.length === 0) return null;
  // Group segments into per-night sessions (split on >2h gaps), then use
  // each session's bed/wake span for consistency.
  const sorted = [...rows].sort((a, b) => a.start - b.start);
  const sessions: { start: number; end: number }[] = [];
  let curStart = sorted[0]?.start;
  let curEnd = sorted[0]?.end;
  if (curStart === undefined || curEnd === undefined) return null;
  for (let i = 1; i < sorted.length; i += 1) {
    const seg = sorted[i];
    if (!seg) continue;
    if (seg.start - curEnd > 2 * 60 * 60 * 1000) {
      sessions.push({ start: curStart, end: curEnd });
      curStart = seg.start;
      curEnd = seg.end;
    } else {
      if (seg.start < curStart) curStart = seg.start;
      if (seg.end > curEnd) curEnd = seg.end;
    }
  }
  sessions.push({ start: curStart, end: curEnd });
  if (sessions.length < 2) return null;
  return engineConsistency(sessions);
}