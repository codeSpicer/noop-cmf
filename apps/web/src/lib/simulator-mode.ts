/**
 * Simulator/demo mode: seed temporary watch data into IndexedDB and remove it later.
 * Simulator data is generated deterministically (fixed seed/anchor). On enable we insert
 * only records whose keys do not already exist, so existing synced/imported data is never
 * overwritten. On disable we remove the simulator dataset's keys (which do not overlap with
 * recent real watch data), leaving your synced/imported data intact.
 */
import type { PersonaId } from '@noop-cmf/watch-simulator';
import { createDemoProvider } from './demo-provider';
import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';

export const SIMULATOR_STORAGE_KEY = 'noop-cmf-simulator-mode';

export interface SimulatorState {
  readonly active: boolean;
  readonly persona?: PersonaId;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function missingNumericKeys(
  table: { bulkGet: (keys: number[]) => Promise<unknown[]> },
  keys: readonly number[],
): Promise<number[]> {
  const missing: number[] = [];
  for (const part of chunk(keys, 2000)) {
    const found = await table.bulkGet(part);
    for (let i = 0; i < part.length; i += 1) {
      if (found[i] === undefined) {
        const key = part[i];
        if (key !== undefined) missing.push(key);
      }
    }
  }
  return missing;
}

async function missingStringKeys(
  table: { bulkGet: (keys: string[]) => Promise<unknown[]> },
  keys: readonly string[],
): Promise<string[]> {
  const missing: string[] = [];
  for (const part of chunk(keys, 2000)) {
    const found = await table.bulkGet(part);
    for (let i = 0; i < part.length; i += 1) {
      if (found[i] === undefined) {
        const key = part[i];
        if (key !== undefined) missing.push(key);
      }
    }
  }
  return missing;
}

export function getSimulatorState(): SimulatorState {
  if (typeof window === 'undefined') {
    return { active: false };
  }
  try {
    const raw = window.localStorage.getItem(SIMULATOR_STORAGE_KEY);
    if (!raw) return { active: false };
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return { active: false };
    const state = parsed as { active?: unknown; persona?: unknown };
    if (state.active !== true) return { active: false };
    const persona = state.persona;
    if (
      persona !== 'endurance-runner' &&
      persona !== 'peak-recovery' &&
      persona !== 'overreaching'
    ) {
      return { active: false };
    }
    return { active: true, persona };
  } catch {
    return { active: false };
  }
}

function setSimulatorState(state: SimulatorState): void {
  if (typeof window === 'undefined') return;
  try {
    if (!state.active) {
      window.localStorage.removeItem(SIMULATOR_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        SIMULATOR_STORAGE_KEY,
        JSON.stringify({ active: true, persona: state.persona }),
      );
    }
  } catch {
    // Ignore storage errors.
  }
}

async function removeSimulatorDataset(
  persona: PersonaId,
  db: NoopCmfDatabase,
): Promise<void> {
  const provider = await createDemoProvider(`?demo=true&persona=${persona}`);
  try {
    const ds = provider.getDataset();
    const hrKeys = ds.hrSamples.map((s) => s.timestamp as number);
    const stressKeys = ds.stressSamples.map((s) => s.timestamp as number);
    const spo2Keys = ds.spo2Samples.map((s) => s.timestamp as number);
    const sleepKeys = ds.sleepSegments.map((s) => s.start as number);
    const workoutKeys = ds.workouts.map((w) => w.id);

    await db.transaction(
      'rw',
      [db.hrSamples, db.stressSamples, db.spo2Samples, db.sleepSegments, db.workouts],
      async () => {
        for (const part of chunk(hrKeys, 5000)) await db.hrSamples.bulkDelete(part);
        for (const part of chunk(stressKeys, 5000)) await db.stressSamples.bulkDelete(part);
        for (const part of chunk(spo2Keys, 5000)) await db.spo2Samples.bulkDelete(part);
        for (const part of chunk(sleepKeys, 5000)) await db.sleepSegments.bulkDelete(part);
        for (const part of chunk(workoutKeys, 5000)) await db.workouts.bulkDelete(part);
      },
    );
  } finally {
    await provider.disconnect();
  }
}

export async function disableSimulatorMode(
  db: NoopCmfDatabase = getDatabase(),
): Promise<void> {
  const state = getSimulatorState();
  if (state.active && state.persona) {
    await removeSimulatorDataset(state.persona, db);
  }
  setSimulatorState({ active: false });
}

export interface EnableSimulatorResult {
  readonly persona: PersonaId;
  readonly inserted: {
    readonly hr: number;
    readonly stress: number;
    readonly spo2: number;
    readonly sleep: number;
    readonly workouts: number;
  };
}

export async function enableSimulatorMode(
  persona: PersonaId,
  db: NoopCmfDatabase = getDatabase(),
): Promise<EnableSimulatorResult> {
  // Remove any previously seeded simulator data first.
  await disableSimulatorMode(db);

  const provider = await createDemoProvider(`?demo=true&persona=${persona}`);
  try {
    const ds = provider.getDataset();

    const [hrMissing, stressMissing, spo2Missing, sleepMissing, workoutMissing] = await Promise.all([
      missingNumericKeys(db.hrSamples, ds.hrSamples.map((s) => s.timestamp as number)),
      missingNumericKeys(db.stressSamples, ds.stressSamples.map((s) => s.timestamp as number)),
      missingNumericKeys(db.spo2Samples, ds.spo2Samples.map((s) => s.timestamp as number)),
      missingNumericKeys(db.sleepSegments, ds.sleepSegments.map((s) => s.start as number)),
      missingStringKeys(db.workouts, ds.workouts.map((w) => w.id)),
    ]);

    const hrSet = new Set(hrMissing);
    const stressSet = new Set(stressMissing);
    const spo2Set = new Set(spo2Missing);
    const sleepSet = new Set(sleepMissing);
    const workoutSet = new Set(workoutMissing);

    const hrToInsert = ds.hrSamples.filter((s) => hrSet.has(s.timestamp as number));
    const stressToInsert = ds.stressSamples.filter((s) => stressSet.has(s.timestamp as number));
    const spo2ToInsert = ds.spo2Samples.filter((s) => spo2Set.has(s.timestamp as number));
    const sleepToInsert = ds.sleepSegments.filter((s) => sleepSet.has(s.start as number));
    const workoutsToInsert = ds.workouts.filter((w) => workoutSet.has(w.id));

    await db.transaction(
      'rw',
      [db.hrSamples, db.stressSamples, db.spo2Samples, db.sleepSegments, db.workouts],
      async () => {
        if (hrToInsert.length > 0) await db.hrSamples.bulkPut([...hrToInsert]);
        if (stressToInsert.length > 0) await db.stressSamples.bulkPut([...stressToInsert]);
        if (spo2ToInsert.length > 0) await db.spo2Samples.bulkPut([...spo2ToInsert]);
        if (sleepToInsert.length > 0) await db.sleepSegments.bulkPut([...sleepToInsert]);
        if (workoutsToInsert.length > 0) await db.workouts.bulkPut([...workoutsToInsert]);
      },
    );

    setSimulatorState({ active: true, persona });

    return {
      persona,
      inserted: {
        hr: hrToInsert.length,
        stress: stressToInsert.length,
        spo2: spo2ToInsert.length,
        sleep: sleepToInsert.length,
        workouts: workoutsToInsert.length,
      },
    };
  } finally {
    await provider.disconnect();
  }
}

