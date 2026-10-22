/**
 * Seeded mulberry32 PRNG: small, fast, and fully deterministic across runs
 * and platforms given the same seed.
 */

/** PRNG state container returned by {@link createMulberry32}. */
export interface Mulberry32 {
  /** Next pseudo-random float in `[0, 1)`. */
  next: () => number;
  /** Next pseudo-random integer in `[min, max]` (inclusive). */
  nextInt: (min: number, max: number) => number;
  /** Current internal state (useful for snapshot tests). */
  state: () => number;
}

/**
 * Create a mulberry32 generator from an unsigned 32-bit seed.
 */
export function createMulberry32(seed: number): Mulberry32 {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const nextInt = (min: number, max: number): number => {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return lo + Math.floor(next() * (hi - lo + 1));
  };
  const current = (): number => state;
  return { next, nextInt, state: current };
}
