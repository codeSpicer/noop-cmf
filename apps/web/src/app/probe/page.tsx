'use client';

import { useState } from 'react';
import {
  ALL_COMMANDS,
  CmfBleSession,
  WebBleTransport,
  decodeWorkoutSummary,
  getNavigatorBluetooth,
  shouldEncrypt,
  commandFromCodes,
  pairWatch,
  authenticate,
  ACTIVITY_FETCH_1,
  ACTIVITY_FETCH_2,
  VENDOR_FFF1_NOTIFY_CHAR_UUID,
  type CmfCommandDef,
} from '@noop-cmf/cmf-ble';
import { getDatabase } from '@/db/database';
import { loadAuthKey, saveAuthKey } from '@/lib/ble-auth-store';

type LogLine = { readonly at: string; readonly text: string };

export default function ProbePage() {
  const [status, setStatus] = useState('Idle');
  const [log, setLog] = useState<LogLine[]>([]);
  const [selected, setSelected] = useState<string>(ALL_COMMANDS[0]?.name ?? '');
  const [payloadHex, setPayloadHex] = useState('');
  const [session, setSession] = useState<CmfBleSession | null>(null);
  const [transport, setTransport] = useState<WebBleTransport | null>(null);

  function append(text: string): void {
    setLog((prev) => [...prev, { at: new Date().toISOString(), text }]);
  }

  async function connect(): Promise<void> {
    const bt = getNavigatorBluetooth();
    if (!bt) {
      setStatus('Web Bluetooth unavailable');
      return;
    }
    const t = new WebBleTransport(bt);
    const connected = await t.connect();
    if (!connected.ok) {
      setStatus(connected.error.message);
      return;
    }
    const s = new CmfBleSession(t);
    const started = await s.start();
    if (!started.ok) {
      setStatus(started.error.message);
      return;
    }
    s.setFrameHandler((cmd, payload) => {
      const def = commandFromCodes(cmd.cmd1, cmd.cmd2);
      const frameName = def?.name ?? 'unknown';
      if (frameName === 'WORKOUT_SUMMARY' || frameName === 'WORKOUT_SUMMARY_V3') {
        const decoded = decodeWorkoutSummary(payload);
        const hex = bytesToHex(payload);
        if (decoded.ok) {
          append(
            `[frame] ${frameName} ${String(payload.length)}b decoded=${String(decoded.value.length)} workout(s): ${decoded.value.map((w) => `${w.activityType} ${new Date(w.start).toISOString()}-${new Date(w.end).toISOString()}`).join(', ')}`,
          );
        } else {
          append(`[frame] ${frameName} ${String(payload.length)}b decode failed: ${decoded.error}`);
        }
        append(`[frame-hex] ${frameName} ${hex}`);
        void (async () => {
          try {
            const db = getDatabase();
            await db.workoutRawFrames.put({
              id: `probe-${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
              data: Array.from(payload).map((b) => b.toString(16).padStart(2, '0')).join(''),
              capturedAt: Date.now(),
            });
            if (decoded.ok && decoded.value.length > 0) {
              await db.workouts.bulkPut(decoded.value as never);
              append(`[frame] saved ${String(decoded.value.length)} workout(s) to DB`);
            }
          } catch (e) {
            append(`[frame] save failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        })();
      }
    });
    await t.startNotifications(VENDOR_FFF1_NOTIFY_CHAR_UUID, (value: Uint8Array) => {
      const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
      let name = 'unknown';
      if (value.length >= 10) {
        const cmd = commandFromCodes(view.getUint16(3, false), view.getUint16(9, false));
        if (cmd) name = cmd.name;
      }
      append(`<~ ${name} (${String(value.length)}b) ${bytesToHex(value)}`);
    });
    setTransport(t);
    setSession(s);
    const stored = await loadAuthKey('cmf-ble');
    if (stored) {
      const authed = await authenticate(s, { model: 'noop-cmf', authKey: stored });
      setStatus(authed.ok ? 'Connected + authenticated' : `Connected (auth failed: ${authed.error.message})`);
      append(authed.ok ? 'authenticated with stored key' : `auth failed: ${authed.error.message}`);
    } else {
      setStatus('Connected (no auth key — click Pair)');
      append('no stored auth key; click Pair');
    }
  }

  async function pair(): Promise<void> {
    if (!session || !transport) {
      setStatus('Not connected');
      return;
    }
    setStatus('Pairing…');
    const result = await pairWatch(session, transport, { model: 'noop-cmf', timeoutMs: 10000 });
    if (result.ok) {
      await saveAuthKey('cmf-ble', result.value);
      setStatus('Paired + authenticated');
      append('paired; auth key stored');
    } else {
      setStatus(`Pair failed: ${result.error.message}`);
      append(`pair failed: ${result.error.message}`);
    }
  }

  async function runDiscovery(): Promise<void> {
    if (!session) {
      setStatus('Not connected');
      return;
    }
    const candidates = [
      'TRIGGER_SYNC',
      'ACTIVITY_FETCH_1',
      'ACTIVITY_FETCH_2',
      'ACTIVITY_DATA',
      'HEART_RATE_RESTING',
      'HEART_RATE_WORKOUT',
      'STRESS',
      'SPO2',
      'SLEEP_DATA',
      'WORKOUT_SUMMARY',
      'WORKOUT_SUMMARY_V3',
      'HEART_RATE_MANUAL_AUTO',
    ];
    for (const name of candidates) {
      const def = ALL_COMMANDS.find((c) => c.name === name);
      if (!def) continue;
      append(`--- trying ${name} ---`);
      const result = await session.send(def, new Uint8Array(), { encrypted: shouldEncrypt(def.name) });
      append(result.ok ? `sent ${name}` : `send failed: ${result.error.message}`);
      await new Promise((resolve) => { setTimeout(resolve, 2000); });
    }
    append('--- discovery done ---');
  }

  async function runFullFetch(): Promise<void> {
    if (!session) {
      setStatus('Not connected');
      return;
    }
    append('--- full fetch start ---');
    const sent1 = await session.send(ACTIVITY_FETCH_1, new Uint8Array([0xa5]), { encrypted: shouldEncrypt(ACTIVITY_FETCH_1.name) });
    append(sent1.ok ? 'sent ACTIVITY_FETCH_1' : `send1 failed: ${sent1.error.message}`);
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
    const sent2 = await session.send(ACTIVITY_FETCH_2, new Uint8Array([0xa5]), { encrypted: shouldEncrypt(ACTIVITY_FETCH_2.name) });
    append(sent2.ok ? 'sent ACTIVITY_FETCH_2' : `send2 failed: ${sent2.error.message}`);
    append('collecting 12s (inbound frames logged above)...');
    await new Promise((resolve) => { setTimeout(resolve, 12000); });
    append('--- full fetch done ---');
  }

  async function disconnect(): Promise<void> {
    if (session) await session.stop();
    if (transport) await transport.disconnect();
    setSession(null);
    setTransport(null);
    setStatus('Disconnected');
    append('disconnected');
  }

  async function send(): Promise<void> {
    if (!session) {
      setStatus('Not connected');
      return;
    }
    const def = ALL_COMMANDS.find((c: CmfCommandDef) => c.name === selected);
    if (!def) return;
    const bytes = hexToBytes(payloadHex);
    append(`-> ${def.name} ${bytesToHex(bytes)}`);
    const result = await session.send(def, bytes, { encrypted: shouldEncrypt(def.name) });
    append(result.ok ? '<- sent ok' : `<- send failed: ${result.error.message}`);
  }

  return (
    <section aria-label="Probe" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Protocol probe</p>
        <h1 className="text-2xl font-semibold text-foreground">BLE Probe</h1>
      </header>
      <p role="status" data-testid="probe-status" className="text-sm text-muted">
        {status}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => { void connect(); }} data-testid="probe-connect" className="min-h-11 px-3 py-2">
          Connect
        </button>
        <button type="button" onClick={() => { void pair(); }} data-testid="probe-pair" className="min-h-11 px-3 py-2">
          Pair
        </button>
        <button type="button" onClick={() => { void disconnect(); }} data-testid="probe-disconnect" className="min-h-11 px-3 py-2">
          Disconnect
        </button>
      </div>
      <div className="rounded-2xl border border-line bg-card p-4 space-y-2">
        <select
          value={selected}
          onChange={(e) => { setSelected(e.target.value); }}
          data-testid="probe-command"
          className="w-full rounded border border-line bg-void p-2 text-base"
        >
          {ALL_COMMANDS.map((c: CmfCommandDef) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          value={payloadHex}
          onChange={(e) => { setPayloadHex(e.target.value); }}
          placeholder="hex payload"
          data-testid="probe-payload"
          className="w-full rounded border border-line bg-void p-2 text-base"
        />
        <button type="button" onClick={() => { void send(); }} data-testid="probe-send">
          Send
        </button>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => { void runDiscovery(); }}
          data-testid="probe-discover"
           className="rounded border border-line px-2 py-1 text-xs font-semibold min-h-11"
        >
          Run discovery
        </button>
        <button
          type="button"
          onClick={() => { void runFullFetch(); }}
          data-testid="probe-full-fetch"
           className="rounded border border-line px-2 py-1 text-xs font-semibold min-h-11"
        >
          Run full fetch
        </button>
        <button
          type="button"
          onClick={() => {
            const text = log.map((l) => `${l.at} ${l.text}`).join('\n');
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `probe-log-${new Date().toISOString()}.txt`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          data-testid="probe-export-log"
           className="rounded border border-line px-2 py-1 text-xs font-semibold min-h-11"
        >
          Export log (txt)
        </button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {['TRIGGER_SYNC', 'ACTIVITY_FETCH_1', 'ACTIVITY_FETCH_2'].map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              const def = ALL_COMMANDS.find((c) => c.name === name);
              if (!def || !session) return;
              void session.send(def, new Uint8Array(), { encrypted: shouldEncrypt(def.name) }).then((r) => {
                append(`quick ${name}: ${r.ok ? 'sent' : r.error.message}`);
              });
            }}
            data-testid={`probe-quick-${name}`}
            className="rounded border border-line px-2 py-1 text-xs min-h-11"
          >
            {name}
          </button>
        ))}
      </div>
      <div
        data-testid="probe-log"
        className="rounded-2xl border border-line bg-card p-4 font-mono text-xs text-muted max-h-96 overflow-auto"
      >
        {log.map((line, i) => (
          <div key={i}>
            {line.at} {line.text}
          </div>
        ))}
      </div>
    </section>
  );
}

function hexToBytes(value: string): Uint8Array {
  const cleaned = value.replace(/\s+/g, '');
  const out = new Uint8Array(Math.floor(cleaned.length / 2));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}