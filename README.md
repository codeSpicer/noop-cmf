# noop-cmf

Local-first, Whoop-style physiological analytics for **Nothing CMF Watch Pro 2** (and related CMF watches).  
noop-cmf is a TypeScript monorepo with a Next.js PWA that syncs watch data over **Web Bluetooth** or imports **Gadgetbridge** SQLite exports, stores everything in **IndexedDB**, and computes recovery, strain, sleep, readiness, and training insights entirely in the browser — no backend, no telemetry.

> Status: active development. Core sync, analytics, and PWA flows work; workout decoding and some protocol edges are still being validated on real hardware.

## Features

### Data sync & storage
- **Web Bluetooth sync** with CMF Watch Pro 2 (pairing/auth, on-demand fetch)
- **Gadgetbridge SQLite import** (`.db` dropzone/file picker)
- **JSON export/import** for full backup and restore (merges into local data)
- **Local-first storage** in IndexedDB (Dexie) — data stays on your device
- **PWA** with offline-capable shell and install prompt

### Analytics
- **Recovery**: 1–99 score from overnight HR/stress vs a rolling 30-day baseline, with RHR and eHRV proxy
- **Readiness / time-to-recovery**: decaying readiness after strain events with a “ready to go” countdown
- **Strain**: daily load (0–21) from Banister TRIMP and HR zones, zone breakdown, intensity minutes, workout TRIMP
- **Sleep**: hypnogram, total sleep, performance, dynamic sleep need/debt, sleep coach (recommended bedtime), consistency score
- **Training load**: acute (7-day) vs chronic (28-day) load, ACWR, and training status (productive/maintaining/overreaching/detraining)
- **Weekly summary**: per-week strain, sleep, steps, energy, and watch wear time
- **Trends & monitoring**: RHR trend, baseline bands, stress trend, health monitor card, energy score
- **Habits**: morning journal and habit-impact view
- **VO₂ max estimator**: Cooper (12-min run) and Rockport (1-mile walk) tests with fitness category
- **Workouts**: workout summary decoding/capture pipeline (in progress; raw frames stored for analysis)

## Supported platforms & devices

| | Support |
|---|---|
| **Watch** | Nothing CMF Watch Pro 2 (primary target). CMF Watch Pro 3 planned/untested. |
| **Browser (Web Bluetooth)** | Chromium-based browsers on desktop and Android (e.g. Chrome, Edge). **Not available on iOS browsers** (Safari/Chrome on iPhone lack Web Bluetooth). |
| **Import** | Gadgetbridge SQLite `.db` exports (desktop or mobile file transfer). |
| **Deployment** | Vercel (or any static/Node host compatible with Next.js). |

## Monorepo structure

```text
noop-cmf/
├─ apps/
│  └─ web/                 # Next.js 15 PWA (App Router, React 19, Tailwind v4, Dexie)
├─ packages/
│  ├─ types/               # Zod schemas, branded primitives, Result<T,E>, provider contracts
│  ├─ physio-engine/       # Strain, recovery/eHRV, sleep, readiness, habits, training-load math
│  ├─ cmf-ble/             # WebBLE transport/session, AES auth, wire decoders, Gadgetbridge parser
│  └─ watch-simulator/     # Seeded 30-day biometric data generator
├─ .github/workflows/ci.yml
├─ turbo.json
└─ pnpm-workspace.yaml
```

## Getting started

### Prerequisites
- **Node.js** >= 20
- **pnpm** >= 9 (repo is configured with `pnpm@11.x`)

### Install

```bash
git clone https://github.com/codeSpicer/noop-cmf.git
cd noop-cmf
pnpm install
```

### Run the web app

```bash
pnpm --filter web dev
```

Open `http://localhost:3000`.

### Build, lint, typecheck, test

```bash
# Full repo gate
pnpm turbo run build typecheck lint test

# Web app only
pnpm --filter web build
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test

# E2E (Playwright)
pnpm --filter web test:e2e
```

## Usage

1. **Sync from watch (Web Bluetooth):** open the app in a supported browser, go to **Sync**, and use **Connect & sync** to pair/fetch data from the watch. Grant Bluetooth permission when prompted.
2. **Import Gadgetbridge data:** on **Sync**, drop or select a Gadgetbridge SQLite `.db` export to import historical samples.
3. **Backup/restore:** use **Export data (JSON)** to download a full snapshot, and **Import data (JSON)** to restore/merge it (useful before clearing browser data or moving devices).
4. **Explore analytics:** Overview, Strain, Recovery, Sleep, Weekly, Training, Journal, and VO₂ Max pages visualize computed metrics from locally stored samples.

> Tip: sync imports are merged (not wiped), so repeated syncs/imports accumulate data.

## Architecture notes

- **`@noop-cmf/types`**: runtime-validated domain schemas (Zod), branded numeric/time primitives, and `Result<T,E>` for cross-package boundaries.
- **`@noop-cmf/physio-engine`**: pure math/analysis (TRIMP strain, rolling-baseline recovery and eHRV proxy, sleep analysis/need, readiness, habits, training load/ACWR, etc.).
- **`@noop-cmf/cmf-ble`**: CMF BLE protocol implementation — framing/encryption (AES), pairing/auth, session/fetch, on-wire decoders, and Gadgetbridge SQLite provider.
- **`apps/web`**: client-side PWA that orchestrates providers, persists to IndexedDB, and renders analytics UI.

## Development & CI

- **Lint/format**: ESLint, Prettier
- **Tests**: Vitest (unit/integration) with coverage thresholds per package; Playwright E2E with `@axe-core/playwright` accessibility checks
- **CI**: GitHub Actions runs lint, typecheck, tests, per-package coverage, and E2E builds

```bash
pnpm format        # write
pnpm format:check  # check
```

## Privacy

All health data is processed and stored locally in your browser’s IndexedDB. There is no backend service and no telemetry. Exports (JSON/Gadgetbridge files you provide) remain under your control.

## Limitations

- Web Bluetooth is unavailable on iOS browsers; a native wrapper (e.g. Capacitor) would be required for iPhone BLE/HealthKit integration.
- Workout decoding and some fetch payload details are still being refined against real-device captures.
- Recovery/readiness metrics are most meaningful with sufficient history (rolling baselines improve as more days are synced/imported).
- Brave and some hardened browser configurations may disable Web Bluetooth.

## License

No `LICENSE` file is included in this repository at this time.
