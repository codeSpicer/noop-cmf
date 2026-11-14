import type { SleepSegment } from '@noop-cmf/types';
import { analyzeSleep } from '@noop-cmf/physio-engine';

export interface SleepSession {
  readonly start: number;
  readonly end: number;
  readonly segments: readonly SleepSegment[];
}

export const SESSION_GAP_MS = 2 * 60 * 60 * 1000;
export const MAIN_SLEEP_GAP_MS = 30 * 60 * 1000;

export function splitSleepSessions(
  segments: readonly SleepSegment[],
  maxGapMs: number = SESSION_GAP_MS,
): SleepSession[] {
  if (segments.length === 0) return [];
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const sessions: { start: number; end: number; segments: SleepSegment[] }[] = [];
  let cur: { start: number; end: number; segments: SleepSegment[] } | null = null;
  for (const seg of sorted) {
    if (!cur) {
      cur = { start: seg.start, end: seg.end, segments: [seg] };
      continue;
    }
    if (seg.start - cur.end > maxGapMs) {
      sessions.push(cur);
      cur = { start: seg.start, end: seg.end, segments: [seg] };
    } else {
      cur.segments.push(seg);
      if (seg.start < cur.start) cur.start = seg.start;
      if (seg.end > cur.end) cur.end = seg.end;
    }
  }
  if (cur) sessions.push(cur);
  return sessions;
}

export interface SelectMainSleepOptions {
  readonly rangeEnd: number;
  readonly dayStartHour?: number;
}

function asleepMinutes(session: SleepSession): number {
  let total = 0;
  for (const seg of session.segments) {
    if (seg.stage === 'light' || seg.stage === 'deep' || seg.stage === 'rem') {
      total += (seg.end - seg.start) / 60000;
    }
  }
  return total;
}

function localHour(ts: number): number {
  return new Date(ts).getHours();
}

/**
 * Pick the primary/main overnight sleep session from sessions that overlap a window.
 * Prefers sessions ending in the morning near rangeEnd with substantial asleep time.
 */
export function selectMainSleepSession(
  sessions: readonly SleepSession[],
  options: SelectMainSleepOptions,
): SleepSession | null {
  if (sessions.length === 0) return null;
  const { rangeEnd } = options;
  const rangeStart = rangeEnd - 24 * 60 * 60 * 1000;

  const candidates = sessions.filter((s) => s.end > rangeStart && s.start < rangeEnd);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;

  let best: SleepSession | null = null;
  let bestScore = -Infinity;
  for (const s of candidates) {
    const asleep = asleepMinutes(s);
    const endHour = localHour(s.end);
    const startHour = localHour(s.start);
    // Prefer sessions ending in morning hours (roughly 3:00-12:00)
    const endsMorning = endHour >= 3 && endHour <= 12 ? 1 : 0;
    // Prefer sessions that end close to rangeEnd (latest data)
    const recency = Math.max(0, 1 - Math.abs(rangeEnd - s.end) / (24 * 60 * 60 * 1000));
    // Prefer longer asleep duration
    const durationScore = asleep / 600; // normalize ~10h
    // Penalize very short sessions
    const shortPenalty = asleep < 60 ? -2 : 0;
    // Penalize sessions that look like previous-night tail ending early yesterday morning
    const endsYesterdayMorning = s.end < rangeEnd - 12 * 60 * 60 * 1000 && endHour >= 3 && endHour <= 11;
    const tailPenalty = endsYesterdayMorning ? -3 : 0;
    // Mild preference for overnight span (starts evening/night or ends morning)
    const overnightish = startHour >= 20 || startHour <= 3 || endsMorning ? 0.2 : 0;

    const score =
      endsMorning * 2 +
      recency * 1.5 +
      durationScore * 2 +
      overnightish +
      shortPenalty +
      tailPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

export interface MainSleepResult {
  readonly session: SleepSession | null;
  readonly allSessionsInWindow: readonly SleepSession[];
  readonly otherSessionsCount: number;
  readonly usedFineSplit: boolean;
  readonly notes: readonly string[];
}

export function computeMainSleep(
  segments: readonly SleepSegment[],
  rangeEnd: number,
): MainSleepResult {
  const rangeStart = rangeEnd - 24 * 60 * 60 * 1000;
  const windowSegments = segments.filter((s) => s.start < rangeEnd && s.end > rangeStart);
  if (windowSegments.length === 0) {
    return {
      session: null,
      allSessionsInWindow: [],
      otherSessionsCount: 0,
      usedFineSplit: false,
      notes: [],
    };
  }

  // Fine-grained split to separate evening rest / off-wrist gaps from main overnight sleep.
  const fineSessions = splitSleepSessions(windowSegments, MAIN_SLEEP_GAP_MS);
  const coarseSessions = splitSleepSessions(windowSegments, SESSION_GAP_MS);
  let session = selectMainSleepSession(fineSessions, { rangeEnd });
  let usedFineSplit = true;

  // If fine split produced only tiny fragments or seems worse, fall back to coarse.
  if (!session) {
    session = selectMainSleepSession(coarseSessions, { rangeEnd });
    usedFineSplit = false;
  }

  const notes: string[] = [];
  if (session) {
    const startHour = localHour(session.start);
    if (startHour >= 18 && startHour <= 22) {
      notes.push(
        'This sleep session starts in the evening. If the watch was not worn then, the main overnight sleep may be shorter than shown.',
      );
    }
    // detect large unsegmented gap inside selected session window? session has contiguous-by-threshold segments
    const segs = [...session.segments].sort((a, b) => a.start - b.start);
    for (let i = 1; i < segs.length; i += 1) {
      const prev = segs[i - 1];
      const cur = segs[i];
      if (prev && cur) {
        const gap = cur.start - prev.end;
        if (gap >= 20 * 60 * 1000) {
          notes.push(
            'A gap was detected within this sleep session (possible off-wrist or awake period). Sleep totals may differ from your watch.',
          );
          break;
        }
      }
    }
    // compare with coarse if different
    if (usedFineSplit && coarseSessions.length < fineSessions.length) {
      notes.push(
        'Showing the primary overnight sleep session. Other sleep/rest periods in the last 24 hours are listed separately.',
      );
    }
  }

  const allSessionsInWindow = usedFineSplit ? fineSessions : coarseSessions;
  const otherSessionsCount = session
    ? allSessionsInWindow.filter((s) => s !== session).length
    : Math.max(0, allSessionsInWindow.length - 1);

  return {
    session,
    allSessionsInWindow,
    otherSessionsCount: Math.max(0, otherSessionsCount),
    usedFineSplit,
    notes,
  };
}

export function summarizeSession(session: SleepSession): ReturnType<typeof analyzeSleep> {
  return analyzeSleep(session.segments);
}
