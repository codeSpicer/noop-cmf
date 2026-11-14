import { z } from 'zod';
import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase, StoredUserProfile } from '@/db/database';

export const DEFAULT_RESTING_HR = 50;
export const DEFAULT_MAX_HR = 190;
export const DEFAULT_DAY_START_HOUR = 0;

export const UserProfileSchema = z.object({
  id: z.literal('default').default('default'),
  restingHeartRate: z.number().int().min(30).max(120).optional(),
  maxHeartRate: z.number().int().min(100).max(230).optional(),
  age: z.number().int().min(10).max(120).optional(),
  sex: z.enum(['male', 'female', 'other']).optional(),
  heightCm: z.number().min(80).max(250).optional(),
  weightKg: z.number().min(20).max(300).optional(),
  dayStartHour: z.union([z.literal(0), z.literal(2)]).optional(),
  updatedAt: z.number().int().nonnegative().optional(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

export interface ResolvedUserProfile {
  readonly restingHeartRate: number;
  readonly maxHeartRate: number;
  readonly dayStartHour: 0 | 2;
  readonly age?: number;
  readonly sex?: 'male' | 'female' | 'other';
  readonly heightCm?: number;
  readonly weightKg?: number;
}

export const DEFAULT_USER_PROFILE: ResolvedUserProfile = {
  restingHeartRate: DEFAULT_RESTING_HR,
  maxHeartRate: DEFAULT_MAX_HR,
  dayStartHour: DEFAULT_DAY_START_HOUR,
};

export function resolveUserProfile(profile: UserProfile | null | undefined): ResolvedUserProfile {
  const rhr = profile?.restingHeartRate ?? DEFAULT_RESTING_HR;
  let maxHr = profile?.maxHeartRate ?? DEFAULT_MAX_HR;
  if (maxHr <= rhr) {
    maxHr = Math.max(rhr + 1, DEFAULT_MAX_HR);
  }
  const dayStartHour = profile?.dayStartHour === 2 ? 2 : 0;
  const resolved: ResolvedUserProfile = {
    restingHeartRate: rhr,
    maxHeartRate: maxHr,
    dayStartHour,
    ...(profile?.age !== undefined ? { age: profile.age } : {}),
    ...(profile?.sex !== undefined ? { sex: profile.sex } : {}),
    ...(profile?.heightCm !== undefined ? { heightCm: profile.heightCm } : {}),
    ...(profile?.weightKg !== undefined ? { weightKg: profile.weightKg } : {}),
  };
  return resolved;
}

export async function loadUserProfile(
  db: NoopCmfDatabase = getDatabase(),
): Promise<UserProfile | null> {
  const row = await db.userProfile.get('default');
  if (!row) return null;
  const parsed = UserProfileSchema.safeParse({ ...row, id: 'default' });
  return parsed.success ? parsed.data : null;
}

export async function loadResolvedUserProfile(
  db: NoopCmfDatabase = getDatabase(),
): Promise<ResolvedUserProfile> {
  const profile = await loadUserProfile(db);
  return resolveUserProfile(profile);
}

export async function saveUserProfile(
  patch: Partial<Omit<UserProfile, 'id'>>,
  db: NoopCmfDatabase = getDatabase(),
): Promise<UserProfile> {
  const existing = await loadUserProfile(db);
  const merged: Record<string, unknown> = { id: 'default', ...(existing ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  merged['updatedAt'] = Date.now();
  const parsed = UserProfileSchema.parse(merged);
  const stored: StoredUserProfile = {
    id: 'default',
    ...(parsed.restingHeartRate !== undefined ? { restingHeartRate: parsed.restingHeartRate } : {}),
    ...(parsed.maxHeartRate !== undefined ? { maxHeartRate: parsed.maxHeartRate } : {}),
    ...(parsed.age !== undefined ? { age: parsed.age } : {}),
    ...(parsed.sex !== undefined ? { sex: parsed.sex } : {}),
    ...(parsed.heightCm !== undefined ? { heightCm: parsed.heightCm } : {}),
    ...(parsed.weightKg !== undefined ? { weightKg: parsed.weightKg } : {}),
    ...(parsed.dayStartHour !== undefined ? { dayStartHour: parsed.dayStartHour } : {}),
    ...(parsed.updatedAt !== undefined ? { updatedAt: parsed.updatedAt } : {}),
  };
  await db.userProfile.put(stored);
  return parsed;
}

/** Start/end (ms) of the local day containing `anchorMs`, shifted by dayStartHour. */
export function getLocalDayWindow(
  anchorMs: number,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
): { start: number; end: number; key: string } {
  const d = new Date(anchorMs);
  const shifted = new Date(d.getTime() - dayStartHour * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = shifted.getMonth();
  const day = shifted.getDate();
  const start = new Date(y, m, day, dayStartHour, 0, 0, 0).getTime();
  const end = new Date(y, m, day + 1, dayStartHour, 0, 0, 0).getTime();
  const mm = String(m + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const key = `${String(y)}-${mm}-${dd}`;
  return { start, end, key };
}

/**
 * Sum daily steps from cumulative counter samples.
 * Uses the max value per local day window; if counter resets within a day,
 * sums segment maxima (defensive).
 */
export function sumDailySteps(
  samples: readonly { timestamp: number; steps: number }[],
): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);
  let total = 0;
  let segMax = sorted[0]?.steps ?? 0;
  let prev = sorted[0]?.steps ?? 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i]?.steps ?? 0;
    if (cur < prev - Math.max(50, prev * 0.2)) {
      // likely reset
      total += segMax;
      segMax = cur;
    } else if (cur > segMax) {
      segMax = cur;
    }
    prev = cur;
  }
  total += segMax;
  return total;
}

export function computeTodaySteps(
  stepSamples: readonly { timestamp: number; steps: number }[],
  anchorMs: number,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
): number {
  const { start, end } = getLocalDayWindow(anchorMs, dayStartHour);
  const day = stepSamples.filter((s) => s.timestamp >= start && s.timestamp < end);
  return sumDailySteps(day);
}

export function localDayKey(ts: number, dayStartHour: number = DEFAULT_DAY_START_HOUR): string {
  return getLocalDayWindow(ts, dayStartHour).key;
}
