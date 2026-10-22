'use client';

import { useEffect, useState } from 'react';
import { GadgetbridgeSqliteProvider, loadSqlJs } from '@noop-cmf/cmf-ble';
import {
  EpochMsSchema,
  MillisecondsSchema,
  RecoveryPercentSchema,
  StrainScoreSchema,
  type TimeRange,
  type WatchDataProvider,
} from '@noop-cmf/types';
import { clearDatabase, getDatabase, type NoopCmfDatabase } from '@/db/database';
import { createDemoProvider, demoPersonas, isDemoMode } from '@/lib/demo-provider';

interface ImportCounts {
  readonly hr: number;
  readonly stress: number;
  readonly spo2: number;
  readonly sleep: number;
  readonly workouts: number;
  readonly steps: number;
}

/** Pull every sample kind from a provider and persist it to IndexedDB. */
async function importAll(
  provider: WatchDataProvider,
  range: TimeRange,
  db: NoopCmfDatabase,
): Promise<ImportCounts> {
  const [hr, stress, spo2, sleep, workouts, steps] = await Promise.all([
    provider.getHeartRateSamples(range),
    provider.getStressSamples(range),
    provider.getSpo2Samples(range),
    provider.getSleepSegments(range),
    provider.getWorkouts(range),
    provider.getStepSamples(range),
  ]);
  await db.transaction(
    'rw',
    [db.hrSamples, db.stressSamples, db.spo2Samples, db.sleepSegments, db.workouts, db.steps],
    async () => {
      if (hr.ok) await db.hrSamples.bulkPut(hr.value);
      if (stress.ok) await db.stressSamples.bulkPut(stress.value);
      if (spo2.ok) await db.spo2Samples.bulkPut(spo2.value);
      if (sleep.ok) await db.sleepSegments.bulkPut(sleep.value);
      if (workouts.ok) await db.workouts.bulkPut(workouts.value);
      if (steps.ok) await db.steps.bulkPut(steps.value);
    },
  );
  return {
    hr: hr.ok ? hr.value.length : 0,
    stress: stress.ok ? stress.value.length : 0,
    spo2: spo2.ok ? spo2.value.length : 0,
    sleep: sleep.ok ? sleep.value.length : 0,
    workouts: workouts.ok ? workouts.value.length : 0,
    steps: steps.ok ? steps.value.length : 0,
  };
}

/** Sync route: demo persona selector, Gadgetbridge dropzone, mock BLE sync. */
export default function SyncPage() {
  const [status, setStatus] = useState('Idle');
  const [persona, setPersona] = useState('endurance-runner');

  useEffect(() => {
    let cancelled = false;
    async function restore(): Promise<void> {
      const db = getDatabase();
      const count = await db.hrSamples.count();
      if (!cancelled && count > 0) {
        setStatus(`Restored ${String(count)} HR samples from local storage.`);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runDemoSync(): Promise<void> {
    setStatus('Syncing demo data…');
    const provider = await createDemoProvider(`?demo=true&persona=${persona}`);
    const db = getDatabase();
    await clearDatabase(db);
    const end = EpochMsSchema.parse(Date.UTC(2024, 0, 30));
    const start = EpochMsSchema.parse(end - 30 * 86_400_000);
    const counts = await importAll(provider, { start, end }, db);
    setStatus(
      `Synced ${String(counts.hr)} HR samples, ${String(counts.workouts)} workouts (${persona}).`,
    );
  }

  async function handleDrop(file: File): Promise<void> {
    setStatus(`Parsing ${file.name}…`);
    await loadSqlJs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const provider = new GadgetbridgeSqliteProvider();
    const loaded = await provider.loadFile(bytes);
    if (!loaded.ok) {
      setStatus('Could not parse that file.');
      return;
    }
    const db = getDatabase();
    await clearDatabase(db);
    const range = { start: EpochMsSchema.parse(0), end: EpochMsSchema.parse(Date.now()) };
    const counts = await importAll(provider, range, db);
    setStatus(
      `Imported ${String(counts.hr)} HR samples, ${String(counts.workouts)} workouts, ${String(counts.steps)} step rows from Gadgetbridge.`,
    );
  }

  async function pushRecovery(): Promise<void> {
    setStatus('Pushing recovery to watch…');
    const provider = await createDemoProvider('?demo=true');
    const result = await provider.pushRecoveryNotification({
      recovery: RecoveryPercentSchema.parse(72),
      ehrv: MillisecondsSchema.parse(110),
      strainTarget: StrainScoreSchema.parse(14.3),
    });
    setStatus(result.ok ? 'Recovery pushed to watch.' : 'Push failed.');
  }

  return (
    <section aria-label="Sync" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Connect</p>
        <h1 className="text-2xl font-semibold text-foreground">Sync</h1>
      </header>
      <p role="status" data-testid="sync-status" className="text-sm text-muted">
        {status}
      </p>
      <div className="rounded-2xl border border-line bg-card p-6">
        <label htmlFor="persona" className="mr-2 text-sm text-muted">
          Demo persona
        </label>
        <select
          id="persona"
          value={persona}
          onChange={(event) => {
            setPersona(event.target.value);
          }}
          className="rounded-lg border border-line bg-void p-2 text-sm text-foreground"
          data-testid="persona-select"
        >
          {demoPersonas().map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            void runDemoSync();
          }}
          className="ml-3 rounded-full bg-strain px-4 py-2 text-sm font-semibold text-[#04121f]"
          data-testid="demo-sync"
        >
          Run demo sync
        </button>
      </div>
      <div
        className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-sm text-muted"
        data-testid="db-dropzone"
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) {
            void handleDrop(file);
          }
        }}
      >
        Drop a Gadgetbridge SQLite .db file here
        <label className="mt-3 inline-block cursor-pointer rounded-full border border-line bg-surface px-4 py-2 text-sm text-foreground hover:bg-void">
          Choose .db file
          <input
            type="file"
            accept=".db"
            aria-label="Upload Gadgetbridge database"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleDrop(file);
              }
            }}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => {
          void pushRecovery();
        }}
        className="rounded-full bg-recovery px-5 py-2 text-sm font-semibold text-[#04121f]"
        data-testid="push-recovery"
      >
        Push Recovery to Watch
      </button>
      {isDemoMode(typeof window === 'undefined' ? '' : window.location.search) ? (
        <p className="text-sm text-muted">Demo mode active.</p>
      ) : null}
    </section>
  );
}
