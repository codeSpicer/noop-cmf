import { describe, expect, it } from 'vitest';
import { sparklinePoints } from './Sparkline';

describe('sparklinePoints', () => {
  it('returns empty for no values', () => {
    expect(sparklinePoints([])).toEqual([]);
  });

  it('maps a flat series to mid-height', () => {
    const points = sparklinePoints([5, 5, 5]);
    expect(points).toHaveLength(3);
    expect(points[0]?.y).toBe(points[1]?.y);
  });

  it('maps min to bottom and max to top', () => {
    const points = sparklinePoints([0, 50, 100], 140, 36);
    expect(points).toHaveLength(3);
    const ys = points.map((point) => point.y);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(36);
    expect(points[0]?.y).toBeGreaterThan(points[2]?.y ?? 0);
  });

  it('centers a single value', () => {
    const points = sparklinePoints([42]);
    expect(points).toHaveLength(1);
    expect(points[0]?.x).toBe(70);
  });
});
