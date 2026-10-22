'use client';

import { useState } from 'react';
import { GadgetbridgeSqliteProvider, loadSqlJs } from '@noop-cmf/cmf-ble';
import {
  EpochMsSchema,
  MillisecondsSchema,
  RecoveryPercentSchema,
  StrainScoreSchema,
} from '@noop-cmf/types';
import { clearDatabase, getDatabase } from '@/db/database';
import { createDemoProvider, demoPersonas, isDemoMode } from '@/lib/demo-provider';

/** Sync route: demo persona selector, Gadgetbridge dropzone, mock BLE sync. */
export default function SyncPage() {
  const [status, setStatus] = useState('Idle');
  const [persona, setPersona] = useState('endurance-runner');

  async function runDemoSync(): Promise<void> {
    setStatus('Syncing demo data…');
    const provider = await createDemoProvider(`?demo=true&persona=${persona}`);
    const db = getDatabase();
    await clearDatabase(db);
    const end = EpochMsSchema.parse(Date.UTC(2024, 0, 30));
    const start = EpochMsSchema.parse(end - 30 * 86_400_000);
    const hr = await provider.getHeartRateSamples({ start, end });
    if (hr.ok) {
      await db.hrSamples.bulkPut(hr.value);
      setStatus(`Synced ${String(hr.value.length)} HR samples (${persona}).`);
    } else {
      setStatus('Demo sync failed.');
    }
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
    const hr = await provider.getHeartRateSamples(range);
    if (hr.ok) {
      await db.hrSamples.bulkPut(hr.value);
      setStatus(`Imported ${String(hr.value.length)} HR samples from Gadgetbridge.`);
    }
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
    <section aria-label="Sync">
      <h1 className="mb-4 text-2xl font-bold">Sync</h1>
      <p role="status" data-testid="sync-status">
        {status}
      </p>
      <div className="mt-4">
        <label htmlFor="persona">Demo persona</label>
        <select
          id="persona"
          value={persona}
          onChange={(event) => {
            setPersona(event.target.value);
          }}
          className="ml-2 bg-card p-2"
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
          className="ml-2 rounded bg-strain px-4 py-2"
          data-testid="demo-sync"
        >
          Run demo sync
        </button>
      </div>
      <div
        className="mt-4 rounded border-2 border-dashed border-card p-6"
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
        <input
          type="file"
          accept=".db"
          aria-label="Upload Gadgetbridge database"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleDrop(file);
            }
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          void pushRecovery();
        }}
        className="mt-4 rounded bg-recovery px-4 py-2 text-black"
        data-testid="push-recovery"
      >
        Push Recovery to Watch
      </button>
      {isDemoMode(typeof window === 'undefined' ? '' : window.location.search) ? (
        <p className="mt-2 text-sm">Demo mode active.</p>
      ) : null}
    </section>
  );
}
