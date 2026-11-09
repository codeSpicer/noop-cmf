'use client';

import { useEffect, useState } from 'react';
import { CmfBleProvider, GadgetbridgeSqliteProvider, WebBleTransport, getNavigatorBluetooth, loadSqlJs } from '@noop-cmf/cmf-ble';
import {
  EpochMsSchema,
  MillisecondsSchema,
  RecoveryPercentSchema,
  StrainScoreSchema,
} from '@noop-cmf/types';
import { getDatabase } from '@/db/database';
import { createDemoProvider } from '@/lib/demo-provider';
import { errorMessage } from '@/lib/errors';
import { importAll } from '@/lib/import';
import { loadAuthKey, saveAuthKey } from '@/lib/ble-auth-store';
import { exportAllData } from '@/lib/export';

/** Sync route: demo persona selector, Gadgetbridge dropzone, mock BLE sync. */
export default function SyncPage() {
  const [status, setStatus] = useState('Idle');

  useEffect(() => {
    let cancelled = false;
    async function restore(): Promise<void> {
      try {
        const db = getDatabase();
        const count = await db.hrSamples.count();
        if (!cancelled && count > 0) {
          setStatus(`Restored ${String(count)} HR samples from local storage.`);
        }
      } catch {
        if (!cancelled) {
          setStatus('Could not read local storage.');
        }
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDrop(file: File): Promise<void> {
    setStatus(`Parsing ${file.name}…`);
    try {
      await loadSqlJs();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const provider = new GadgetbridgeSqliteProvider();
      const loaded = await provider.loadFile(bytes);
      if (!loaded.ok) {
        setStatus('Could not parse that file.');
        return;
      }
      const db = getDatabase();
      // Merge with existing data (do not wipe) so imports accumulate.
      const range = { start: EpochMsSchema.parse(0), end: EpochMsSchema.parse(Date.now()) };
      const counts = await importAll(provider, range, db);
      setStatus(
        `Imported ${String(counts.hr)} HR samples, ${String(counts.workouts)} workouts, ${String(counts.steps)} step rows from Gadgetbridge.`,
      );
    } catch (err) {
      setStatus(`Import failed: ${errorMessage(err, 'unknown error')}`);
    }
  }

  async function pushRecovery(): Promise<void> {
    setStatus('Pushing recovery to watch…');
    try {
      const provider = await createDemoProvider('?demo=true');
      const result = await provider.pushRecoveryNotification({
        recovery: RecoveryPercentSchema.parse(72),
        ehrv: MillisecondsSchema.parse(110),
        strainTarget: StrainScoreSchema.parse(14.3),
      });
      setStatus(result.ok ? 'Recovery pushed to watch.' : 'Push failed.');
    } catch (err) {
      setStatus(`Push failed: ${errorMessage(err, 'unknown error')}`);
    }
  }

  async function runBleSync(): Promise<void> {
    setStatus('Connecting to watch…');
    try {
      const bluetooth = getNavigatorBluetooth();
      if (!bluetooth) {
        setStatus('Web Bluetooth is not available in this browser.');
        return;
      }
      const transport = new WebBleTransport(bluetooth);
      const authKey = await loadAuthKey('cmf-ble');
      const provider = new CmfBleProvider(
        authKey === undefined
          ? { model: 'noop-cmf', transport }
          : { model: 'noop-cmf', authKey, transport },
      );
      const connected = await provider.connect();
      if (!connected.ok) {
        setStatus(`Connect failed: ${connected.error.message}`);
        return;
      }
      if (provider.authKey) {
        await saveAuthKey('cmf-ble', provider.authKey);
      }
      setStatus('Syncing from watch…');
      const db = getDatabase();
      // Merge with existing data (do not wipe) so repeated syncs accumulate.
      const end = EpochMsSchema.parse(Date.now());
      const start = EpochMsSchema.parse(end - 30 * 86_400_000);
      const counts = await importAll(provider, { start, end }, db);
      // Persist raw workout frames for later decoding.
      if (provider.lastRawWorkoutFrames.length > 0) {
        const db = getDatabase();
        await db.workoutRawFrames.bulkPut(
          provider.lastRawWorkoutFrames.map((f, i) => ({
            id: `frame-${String(Date.now())}-${String(i)}`,
            data: Array.from(f).map((b) => b.toString(16).padStart(2, '0')).join(''),
            capturedAt: Date.now(),
          })),
        );
        console.log('WORKOUT_SUMMARY frames:', provider.lastRawWorkoutFrames.map((f) => Array.from(f).map((b) => b.toString(16).padStart(2, '0')).join(' ')));
      }
      await provider.disconnect();
      setStatus(
        `BLE sync: ${String(counts.hr)} HR, ${String(counts.stress)} stress, ${String(counts.spo2)} spo2, ${String(counts.sleep)} sleep, ${String(counts.steps)} steps, ${String(counts.workouts)} workouts.`,
      );
    } catch (err) {
      setStatus(`BLE sync failed: ${errorMessage(err, 'unknown error')}`);
    }
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
        <p className="text-sm text-muted">Import a Gadgetbridge SQLite .db file or sync from a connected watch.</p>
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
        className="rounded-full bg-recovery px-5 py-2 text-sm font-semibold text-[#0e0d0b] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-recovery"
        data-testid="push-recovery"
      >
        Push Recovery to Watch
      </button>
      <button
        type="button"
        onClick={() => {
          void runBleSync();
        }}
        className="rounded-full bg-strain px-5 py-2 text-sm font-semibold text-[#0e0d0b] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-strain"
        data-testid="ble-sync"
      >
        Connect &amp; sync (watch)
      </button>
      <button
        type="button"
        onClick={() => {
          void exportAllData();
        }}
        className="rounded-full border border-line bg-surface px-5 py-2 text-sm font-semibold text-foreground"
        data-testid="export-data"
      >
        Export data (JSON)
      </button>
    </section>
  );
}
