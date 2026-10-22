import { describe, expect, it } from 'vitest';
import { hypnogramRects } from './Hypnogram';

describe('hypnogramRects', () => {
  it('returns empty for no segments', () => {
    expect(hypnogramRects([])).toEqual([]);
  });

  it('positions segments across the full width', () => {
    const rects = hypnogramRects(
      [
        { start: 0, end: 3_600_000, stage: 'light' },
        { start: 3_600_000, end: 7_200_000, stage: 'deep' },
      ],
      560,
      22,
    );
    expect(rects).toHaveLength(2);
    expect(rects[0]?.x).toBe(0);
    expect(rects[1]?.x).toBe(280);
  });

  it('stacks stages in awake/rem/light/deep order', () => {
    const rects = hypnogramRects(
      [
        { start: 0, end: 1000, stage: 'awake' },
        { start: 1000, end: 2000, stage: 'rem' },
        { start: 2000, end: 3000, stage: 'light' },
        { start: 3000, end: 4000, stage: 'deep' },
      ],
      400,
      20,
    );
    expect(rects.map((rect) => rect.y)).toEqual([0, 20, 40, 60]);
  });
});
