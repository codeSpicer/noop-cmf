export type Sex = 'male' | 'female';

/** Cooper 12-minute run test: VO2max = (distance_m - 504.9) / 44.73 */
export function estimateCooper(distanceMeters: number): number {
  return (distanceMeters - 504.9) / 44.73;
}

/** Rockport 1-mile walk test. */
export function estimateRockport(
  weightKg: number,
  age: number,
  sex: Sex,
  timeMin: number,
  hr: number,
): number {
  const sexCoeff = sex === 'male' ? 6.315 : 0;
  return 132.853 - 0.0769 * weightKg - 0.3877 * age + sexCoeff - 3.2649 * timeMin - 0.1565 * hr;
}

export type Vo2Category = 'poor' | 'fair' | 'good' | 'excellent' | 'superior';

/** Fitness category by age/sex (simplified ACSM table). */
export function vo2maxCategory(vo2: number, age: number, sex: Sex): Vo2Category {
  const maleThresholds: Record<number, number[]> = {
    20: [33, 36.5, 42.5, 46.5],
    30: [31.5, 35.5, 41, 45],
    40: [30.2, 33.6, 38.9, 43.7],
    50: [26.1, 30.9, 35.7, 40.9],
    60: [20.5, 26, 32.2, 36.4],
  };
  const femaleThresholds: Record<number, number[]> = {
    20: [28, 33, 36.9, 41],
    30: [26.9, 31.4, 35.6, 40],
    40: [24.4, 28.9, 32.9, 36.9],
    50: [22.8, 26.9, 31.4, 35.7],
    60: [20.2, 24.4, 30.3, 31.4],
  };
  const table = sex === 'male' ? maleThresholds : femaleThresholds;
  const ageBucket = [20, 30, 40, 50, 60].reduce((prev, cur) => (age >= cur ? cur : prev), 20);
  const t = table[ageBucket] ?? table[20] ?? [33, 36.5, 42.5, 46.5];
  const p0 = t[0] ?? 33;
  const p1 = t[1] ?? 36.5;
  const p2 = t[2] ?? 42.5;
  const p3 = t[3] ?? 46.5;
  if (vo2 < p0) return 'poor';
  if (vo2 < p1) return 'fair';
  if (vo2 < p2) return 'good';
  if (vo2 < p3) return 'excellent';
  return 'superior';
}