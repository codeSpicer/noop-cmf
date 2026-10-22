/**
 * Dexie.js IndexedDB schema: the local-first store for every sample kind,
 * workout, journal entry, and computed cycle.
 */
import Dexie, { type Table } from 'dexie';
import type {
  HrSample,
  JournalEntry,
  PhysiologicalCycle,
  SleepSegment,
  Spo2Sample,
  StressSample,
  Workout,
} from '@noop-cmf/types';

export interface StoredCycle extends PhysiologicalCycle {
  readonly id: string;
}

export class NoopCmfDatabase extends Dexie {
  hrSamples!: Table<HrSample, number>;
  stressSamples!: Table<StressSample, number>;
  spo2Samples!: Table<Spo2Sample, number>;
  sleepSegments!: Table<SleepSegment, number>;
  workouts!: Table<Workout, string>;
  journalEntries!: Table<JournalEntry, string>;
  cycles!: Table<StoredCycle, string>;

  constructor(name = 'noop-cmf') {
    super(name);
    this.version(1).stores({
      hrSamples: 'timestamp',
      stressSamples: 'timestamp',
      spo2Samples: 'timestamp',
      sleepSegments: 'start, end',
      workouts: 'id, start, end',
      journalEntries: 'date',
      cycles: 'id, startWake',
    });
  }
}

let instance: NoopCmfDatabase | undefined;

/** Shared database instance (per name, for test isolation). */
export function getDatabase(name = 'noop-cmf'): NoopCmfDatabase {
  if (name !== 'noop-cmf' || !instance) {
    if (name === 'noop-cmf') {
      instance = new NoopCmfDatabase(name);
      return instance;
    }
    return new NoopCmfDatabase(name);
  }
  return instance;
}

/** Delete every row in every table. */
export async function clearDatabase(db: NoopCmfDatabase): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.hrSamples,
      db.stressSamples,
      db.spo2Samples,
      db.sleepSegments,
      db.workouts,
      db.journalEntries,
      db.cycles,
    ],
    async () => {
      await Promise.all([
        db.hrSamples.clear(),
        db.stressSamples.clear(),
        db.spo2Samples.clear(),
        db.sleepSegments.clear(),
        db.workouts.clear(),
        db.journalEntries.clear(),
        db.cycles.clear(),
      ]);
    },
  );
}
