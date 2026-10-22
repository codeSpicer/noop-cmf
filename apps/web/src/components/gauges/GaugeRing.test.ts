import { describe, expect, it } from 'vitest';
import { gaugeArcPath } from './GaugeRing';

describe('gaugeArcPath', () => {
  it('returns empty path for zero and negative values', () => {
    expect(gaugeArcPath(0, 100)).toBe('');
    expect(gaugeArcPath(-5, 100)).toBe('');
  });

  it('produces a path for partial values', () => {
    const path = gaugeArcPath(50, 100);
    expect(path.startsWith('M')).toBe(true);
    expect(path).toContain('A');
  });

  it('handles full scale and degenerate max', () => {
    expect(gaugeArcPath(100, 100)).toContain('A');
    expect(gaugeArcPath(150, 100)).toContain('A');
    expect(gaugeArcPath(50, 0)).toBe('');
  });

  it('computes distinct arcs for different fractions', () => {
    const yellow = gaugeArcPath(34, 99, 120, 12);
    const green = gaugeArcPath(67, 99, 120, 12);
    expect(yellow).not.toBe(green);
    expect(yellow.length).toBeGreaterThan(0);
    expect(green.length).toBeGreaterThan(0);
  });
});
