import { describe, expect, it } from 'vitest';
import { EpochMsSchema } from '@noop-cmf/types';
import type { SleepSegment } from '@noop-cmf/types';
import { computeMainSleep, splitSleepSessions } from './sleep-sessions';

function seg(start: number, end: number, stage: SleepSegment['stage'] = 'light'): SleepSegment {
  return { start: EpochMsSchema.parse(start), end: EpochMsSchema.parse(end), stage };
}

describe('sleep-sessions', () => {
  it('selects primary overnight session and excludes previous-night tail and early evening rest', () => {
    // Local-time construction so hour-based heuristics are stable in any timezone.
    const day = (y: number, m: number, d: number, hh: number, mm: number): number =>
      new Date(y, m, d, hh, mm, 0, 0).getTime();

    // Range ends morning of Nov 14 (latest data)
    const rangeEnd = day(2026, 10, 14, 8, 15);

    const segments: SleepSegment[] = [
      // Previous-night tail ending morning of Nov 13 (inside trailing 24h window, should be excluded)
      seg(day(2026, 10, 13, 8, 3), day(2026, 10, 13, 8, 28), 'light'),

      // Early evening rest on Nov 13 (separate period, not main overnight sleep)
      seg(day(2026, 10, 13, 20, 51), day(2026, 10, 13, 21, 30), 'light'),
      seg(day(2026, 10, 13, 21, 30), day(2026, 10, 13, 22, 0), 'deep'),

      // Main overnight sleep ending morning of Nov 14 (after a >30m gap from evening rest)
      seg(day(2026, 10, 14, 0, 20), day(2026, 10, 14, 3, 0), 'light'),
      seg(day(2026, 10, 14, 3, 0), day(2026, 10, 14, 5, 0), 'deep'),
      seg(day(2026, 10, 14, 5, 0), day(2026, 10, 14, 6, 30), 'rem'),
      seg(day(2026, 10, 14, 6, 30), day(2026, 10, 14, 8, 8), 'light'),
    ];

    const result = computeMainSleep(segments, rangeEnd);
    expect(result.session).not.toBeNull();
    expect(result.session?.start).toBe(day(2026, 10, 14, 0, 20));
    expect(result.session?.end).toBe(day(2026, 10, 14, 8, 8));
    expect(result.otherSessionsCount).toBeGreaterThan(0);
  });

  it('splits sessions on long gaps', () => {
    const base = new Date(2026, 0, 1, 22, 0, 0, 0).getTime();
    const MS = 60 * 1000;
    const H = 60 * MS;
    const sessions = splitSleepSessions([
      seg(base, base + 30 * MS),
      seg(base + 40 * MS, base + 70 * MS),
      seg(base + 70 * MS + 3 * H, base + 70 * MS + 4 * H),
    ]);
    expect(sessions.length).toBe(2);
  });
});
