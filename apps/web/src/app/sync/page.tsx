'use client';

import { useEffect, useState } from 'react';
import { CmfBleProvider, GadgetbridgeSqliteProvider, WebBleTransport, getNavigatorBluetooth, loadSqlJs } from '@noop-cmf/cmf-ble';
import { EpochMsSchema } from '@noop-cmf/types';
import type { PersonaId } from '@noop-cmf/watch-simulator';
import { getDatabase } from '@/db/database';
import { errorMessage } from '@/lib/errors';
import { importAll } from '@/lib/import';
import { loadAuthKey, saveAuthKey } from '@/lib/ble-auth-store';
import { exportAllData } from '@/lib/export';
import { importAllFromJson } from '@/lib/import-json';
import { demoPersonas } from '@/lib/demo-provider';
import {
  disableSimulatorMode,
  enableSimulatorMode,
  getSimulatorState,
} from '@/lib/simulator-mode';

/** Sync route: watch sync, data import/export, and watch simulator demo mode. */
export default function SyncPage() {
  const [status, setStatus] = useState('Idle');
  const [simulatorActive, setSimulatorActive] = useState(false);
  const [simulatorPersona, setSimulatorPersona] = useState<PersonaId>('endurance-runner');
  const [simulatorBusy, setSimulatorBusy] = useState(false);

  useEffect(() => {
    const state = getSimulatorState();
    setSimulatorActive(state.active);
    if (state.persona) {
      setSimulatorPersona(state.persona);
    }
  }, []);

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

  async function handleJsonImport(file: File): Promise<void> {
    setStatus(`Importing ${file.name}…`);
    try {
      const counts = await importAllFromJson(file);
      setStatus(
        `JSON import: ${String(counts.hr)} HR, ${String(counts.stress)} stress, ${String(counts.spo2)} spo2, ${String(counts.sleep)} sleep, ${String(counts.steps)} steps, ${String(counts.workouts)} workouts, ${String(counts.rawFrames)} raw frames.`,
      );
    } catch (err) {
      setStatus(`JSON import failed: ${errorMessage(err, 'unknown error')}`);
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
        await db.workoutRawFrames.bulkPut(
          provider.lastRawWorkoutFrames.map((f, i) => ({
            id: `frame-${String(Date.now())}-${String(i)}`,
            data: Array.from(f).map((b) => b.toString(16).padStart(2, '0')).join(''),
            capturedAt: Date.now(),
          })),
        );
        console.log(
          'WORKOUT_SUMMARY frames:',
          provider.lastRawWorkoutFrames.map((f) => Array.from(f).map((b) => b.toString(16).padStart(2, '0')).join(' ')),
        );
      }
      if (provider.lastFetchDebug) {
        console.log('Sync debug:', provider.lastFetchDebug);
      }
      await provider.disconnect();
      const debugSuffix = provider.lastFetchDebug ? ` Debug: ${provider.lastFetchDebug}` : '';
      setStatus(
        `BLE sync: ${String(counts.hr)} HR, ${String(counts.stress)} stress, ${String(counts.spo2)} spo2, ${String(counts.sleep)} sleep, ${String(counts.steps)} steps, ${String(counts.workouts)} workouts.${debugSuffix}`,
      );
    } catch (err) {
      setStatus(`BLE sync failed: ${errorMessage(err, 'unknown error')}`);
    }
  }

  async function toggleSimulator(): Promise<void> {
    setSimulatorBusy(true);
    try {
      const db = getDatabase();
      if (simulatorActive) {
        await disableSimulatorMode(db);
        setSimulatorActive(false);
        setStatus(
          'Simulator mode turned off. Temporary demo data was removed; your synced/imported data was not changed.',
        );
      } else {
        const result = await enableSimulatorMode(simulatorPersona, db);
        setSimulatorActive(true);
        setStatus(
          `Simulator mode enabled (${result.persona}). Seeded ${String(result.inserted.hr)} HR, ${String(result.inserted.sleep)} sleep, ${String(result.inserted.workouts)} workout records (and related samples). Open Overview/other pages to explore. Turn off to remove only this demo data — your synced/imported data stays safe.`,
        );
      }
    } catch (err) {
      setStatus(`Simulator error: ${errorMessage(err, 'unknown error')}`);
    } finally {
      setSimulatorBusy(false);
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
      <label className="inline-block cursor-pointer rounded-full border border-line bg-surface px-5 py-2 text-sm font-semibold text-foreground">
        Import data (JSON)
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Import JSON data"
          className="sr-only"
          data-testid="import-json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleJsonImport(file);
            }
          }}
        />
      </label>

      <div className="rounded-2xl border border-line bg-card p-6 space-y-3" data-testid="simulator-card">
        <div>
          <p className="text-sm font-semibold text-foreground">Simulator mode (demo)</p>
          <p className="text-sm text-muted">
            Seed sample watch data into this browser to explore the dashboard without a watch. Turning
            it off removes only the simulator demo data — your synced/imported data is not changed or
            deleted.
          </p>
          <p className="mt-1 text-xs text-muted">
            Status: {simulatorActive ? `On (${simulatorPersona})` : 'Off'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted">
            Persona{' '}
            <select
              value={simulatorPersona}
              onChange={(event) => {
                setSimulatorPersona(event.target.value as PersonaId);
              }}
              disabled={simulatorBusy}
              className="ml-1 rounded-lg border border-line bg-surface px-2 py-1 text-foreground"
              data-testid="simulator-persona"
            >
              {demoPersonas().map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              void toggleSimulator();
            }}
            disabled={simulatorBusy}
            className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-void disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="simulator-toggle"
          >
            {simulatorBusy
              ? simulatorActive
                ? 'Turning off…'
                : 'Seeding…'
              : simulatorActive
                ? 'Turn off simulator'
                : 'Enable simulator'}
          </button>
        </div>
      </div>
    </section>
  );
}
