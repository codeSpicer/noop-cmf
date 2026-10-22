import { describe, expect, it } from 'vitest';
import { createMulberry32 } from './prng.js';

describe('createMulberry32', () => {
  it('produces floats in [0, 1)', () => {
    const rng = createMulberry32(42);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('produces byte-identical streams across independent instances', () => {
    const streamA = createMulberry32(42);
    const streamB = createMulberry32(42);
    const seqA = Array.from({ length: 100 }, () => streamA.next());
    const seqB = Array.from({ length: 100 }, () => streamB.next());
    expect(seqA).toEqual(seqB);
  });

  it('diverges for different seeds', () => {
    const a = createMulberry32(1);
    const b = createMulberry32(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('nextInt stays within inclusive bounds', () => {
    const rng = createMulberry32(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.nextInt(25, 240);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(25);
      expect(value).toBeLessThanOrEqual(240);
    }
  });

  it('exposes advancing internal state', () => {
    const rng = createMulberry32(9);
    const before = rng.state();
    rng.next();
    expect(rng.state()).not.toBe(before);
  });
});
