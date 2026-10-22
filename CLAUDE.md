================================================================================
PROJECT SPECIFICATION: noop-cmf (CLAUDE.txt / CLAUDE.md)
Open-Source, Local-First Whoop-Style Physiological Analytics & WebBLE Companion
Target Hardware: Nothing CMF Watch Pro 2 & CMF Watch Pro 3
================================================================================

1. EXECUTION PROTOCOL FOR CLAUDE CODE (READ FIRST)

---

1.1 Sequential Phase Execution:
Execute strictly ONE phase at a time. Never begin Phase N+1 until the
Verification Gate Command for Phase N exits with code 0 and meets all test
coverage thresholds.

1.2 Test-First Implementation (TDD):
For all physiological math (@noop-cmf/physio-engine) and binary protocol
(@noop-cmf/cmf-ble) modules, write unit tests and property-based tests
before or alongside implementation code.

1.3 Zero-Hardware Requirement:
Every feature, screen, and sync pipeline must work out-of-the-box without
physical hardware via the deterministic simulator (?demo=true) and in-memory
MockBleTransport so CI pipelines and contributors without a watch can test
100% of the codebase.

1.4 Atomic Git Commits:
After passing each Phase Gate, stage and commit all work using Conventional
Commits (e.g., "feat(physio-engine): implement TRIMP and Z-score recovery").

2. MONOREPO DIRECTORY ARCHITECTURE (Turborepo + pnpm)

---

noop-cmf/
|-- .github/
| +-- workflows/
| +-- ci.yml # Lint, Typecheck, Vitest Coverage, Playwright E2E
|-- apps/
| +-- web/ # Next.js 15+ (App Router), React 19, Tailwind v4, PWA
| |-- src/
| | |-- app/
| | | |-- (dashboard)/ # Overview (3 Rings, Health Monitor, Strain Target)
| | | |-- strain/ # Logarithmic curve, HR Zones 1-5, Workout TRIMP
| | | |-- recovery/ # 30-day RHR & eHRV baseline band charts
| | | |-- sleep/ # Stepped Hypnogram, Restorative %, Sleep Need
| | | |-- journal/ # Daily habit checklist & +/-% Recovery impact bars
| | | +-- sync/ # WebBLE Pairing Wizard, Gadgetbridge Dropzone, Demo
| | |-- components/
| | | |-- gauges/ # SVG Circular Arc Rings (Strain, Recovery, Sleep)
| | | |-- charts/ # Hypnogram, HR Zone Timeline, Baseline Band Charts
| | | |-- monitor/ # 5-Metric Health Monitor Card
| | | +-- sync/ # BLE Connection Modal, SQLite Dropzone, Persona UI
| | |-- db/ # Dexie.js (IndexedDB) schema, migrations, repos
| | +-- workers/ # Web Worker for SQLite WASM & 30d rolling math
| +-- e2e/ # Playwright E2E + @axe-core/playwright specs
|-- packages/
| |-- types/ # Zod schemas, branded types, Result<T,E> (@noop-cmf/types)
| |-- physio-engine/ # Pure TS Strain, Recovery, eHRV & Sleep math (@noop-cmf/physio-engine)
| |-- cmf-ble/ # WebBLE GATT, AES-128-CBC codec, SQLite parser (@noop-cmf/cmf-ble)
| +-- watch-simulator/ # Seeded 30-day biometric & BLE generator (@noop-cmf/watch-simulator)
|-- turbo.json
|-- pnpm-workspace.yaml
+-- tsconfig.base.json

3. CODE QUALITY STANDARDS & STATIC ANALYSIS GUARDRAILS

---

3.1 TypeScript Compiler Flags (tsconfig.base.json):
All workspaces must compile with zero errors under these strict settings: - "strict": true - "noUncheckedIndexedAccess": true - "exactOptionalPropertyTypes": true - "noImplicitOverride": true - "noFallthroughCasesInSwitch": true - "noUnusedLocals": true - "noUnusedParameters": true - "noPropertyAccessFromIndexSignature": true

3.2 ESLint & Type Safety Rules: - BANNED: "any" type (@typescript-eslint/no-explicit-any: "error") - BANNED: Non-null assertions "!" (@typescript-eslint/no-non-null-assertion: "error") - BANNED: Floating promises (@typescript-eslint/no-floating-promises: "error") - BANNED: Direct console.log in packages/* (inject a structured Logger interface) - BANNED: Magic numbers in math or BLE protocol packages (all opcodes, GATT
UUIDs, and physiological scaling constants must be named constants with JSDoc)

3.3 Branded Primitive Types (@noop-cmf/types):
Enforce domain unit safety at compile time using branded types: - EpochMs (UTC timestamp in milliseconds) - Bpm (Heart Rate 25..240) - StressScore (CMF PPG Stress 1..99) - SpO2Percent (Blood Oxygen 70..100) - StrainScore (Whoop Logarithmic Scale 0.0..21.0) - RecoveryPercent (Readiness 1..99) - Milliseconds (Duration / eHRV proxy 15..180)

3.4 Explicit Error Handling Pattern (Result<T, E>):
Never throw untyped exceptions across package boundaries. All BLE decoders,
AES-128-CBC crypto functions, and SQLite parsers must return:
type Result<T, E> =
| { readonly ok: true; readonly value: T }
| { readonly ok: false; readonly error: E };

3.5 Runtime Boundary Validation:
Every external payload (BLE Uint8Array frames, Gadgetbridge SQLite rows,
JSON file imports, localStorage state) must be parsed through Zod schemas
before entering domain logic.

4. CORE DOMAIN SPECIFICATIONS & MATHEMATICAL CONTRACTS

---

4.1 Sleep-Anchored Physiological Cycle:
A PhysiologicalCycle starts at wake-up time T_wake(d-1) and ends at wake-up
time T_wake(d). Pre-midnight sleep belongs to the next morning's Recovery
calculation (matching Whoop's cycle model rather than midnight resets).

4.2 Physiological Equations (@noop-cmf/physio-engine):

    [A] Heart Rate Reserve Fraction (HR_ratio):
        HR_ratio(t) = clamp(0, 1, (HR(t) - RHR) / (HR_max - RHR))

    [B] Exponential Banister TRIMP:
        For each 1-minute sample interval dt where HR_ratio(t) >= 0.30:
        TRIMP = sum( dt * HR_ratio(t) * 0.64 * exp(1.92 * HR_ratio(t)) )

    [C] Logarithmic Day Strain (0.0 to 21.0):
        Strain = min(21.0, round_1( k * ln(1 + TRIMP / c) ))
        Default calibration constants: k = 6.2, c = 18.0

    [D] Overnight RHR & Estimated HRV (eHRV Proxy):
        - Filter HR and Stress samples strictly overlapping with asleep stages
          ('light', 'deep', 'rem').
        - OvernightRHR = 10th percentile of sleep HR samples.
        - OvernightStress = arithmetic mean of sleep stress samples (1..99).
        - eHRV (ms proxy) = clamp(15, 180, round(
            110 - 0.9 * OvernightStress - 0.6 * (OvernightRHR - BaselineRHR_30d)
          ))

    [E] Rolling 30-Day Z-Score Recovery (1% to 99%):
        - Compute rolling 30-day mean (mu) and sample standard deviation (sigma)
          for eHRV and OvernightRHR.
        - Cold-Start / Zero-Variance Guard: If history < 3 days or sigma < 1.0,
          clamp denominators to sigma_eHRV = max(sigma, 4.0) and
          sigma_RHR = max(sigma, 2.0) to guarantee division by zero cannot occur.
        - Z_eHRV = (eHRV_today - mu_eHRV_30d) / sigma_eHRV
        - Z_RHR  = (RHR_today  - mu_RHR_30d)  / sigma_RHR
        - Recovery = clamp(1, 99, round(
            50 + 18 * Z_eHRV - 14 * Z_RHR + 0.25 * (SleepPerformance - 80)
          ))
        - Recovery Color Tiers:
          * Green:  67% to 99%
          * Yellow: 34% to 66%
          * Red:    1%  to 33%

    [F] Optimal Strain Target & Dynamic Sleep Need:
        - OptimalStrainTarget = round_1(6.0 + (Recovery / 100) * 11.5)
        - SleepNeed_tonight (mins) = BaselineSleep(450)
            + round(3.0 * Strain_today)
            + round(0.50 * SleepDebt_prev)

5. TESTING STRATEGY & COVERAGE MATRIX
--------------------------------------------------------------------------------

5.1 @noop-cmf/types - Runner: Vitest - Minimum Coverage: 100% Statements - Required Scenarios: Valid/invalid Zod boundary inputs, branded type
constructors, Result<T,E> unwrapping helpers.

5.2 @noop-cmf/physio-engine - Runner: Vitest + fast-check (Property-Based Testing) - Minimum Coverage: >= 95% Lines & Branches - Required Scenarios: * 1,000-run fast-check fuzzing proving Strain is always within [0.0, 21.0]
and monotonically non-decreasing when high-HR samples are appended. * 1,000-run fast-check fuzzing proving Recovery is always an integer in
[1, 99] and never NaN or Infinity even when 30-day variance sigma = 0. * Pre-midnight sleep stage alignment across timezone boundaries. * HabitCorrelationEngine delta calculation with sparse journal entries.

5.3 @noop-cmf/watch-simulator - Runner: Vitest - Minimum Coverage: >= 90% Lines - Required Scenarios: Deterministic mulberry32 PRNG verification (seed 42
produces byte-identical 30-day arrays across runs); persona validation.

5.4 @noop-cmf/cmf-ble - Runner: Vitest + sql.js (SQLite WASM) - Minimum Coverage: >= 90% Lines & Branches - Required Scenarios: * Plain-text Factory AT shell ("AT GETSECRET") command/response parsing. * SHA-256 challenge-response derivation and Web Crypto AES-128-CBC
round-trip frame encryption and decryption. * Fragmented BLE MTU packet reassembly and corrupted CRC32 rejection. * Programmatic in-memory Gadgetbridge SQLite database fixture creation
and full extraction of device, activity, HR, and sleep records.

5.5 apps/web (Unit, Integration & E2E) - Runners: Vitest + Testing Library + fake-indexeddb; Playwright + Axe - Minimum Coverage: >= 85% Unit Lines; 100% Core E2E User Journeys - Required Scenarios: * SVG arc ring stroke-dashoffset math and color tier transitions. * Dexie.js IndexedDB repository CRUD and Web Worker sync pipeline. * Playwright E2E: Booting ?demo=true, switching personas, dragging and
dropping a Gadgetbridge SQLite .db file, executing Mock WebBLE sync +
"Push Recovery to Watch", logging a Morning Journal entry, and passing
@axe-core/playwright with 0 serious/critical WCAG AA violations.

6. PHASED IMPLEMENTATION PLAN & VERIFICATION GATES

---

PHASE 1: Workspace Scaffolding & Domain Contracts (@noop-cmf/types)
Tasks:

1. Initialize pnpm-workspace.yaml, turbo.json, tsconfig.base.json, ESLint 9
   flat config, Prettier, and root Vitest workspace config.
2. Create packages/types with branded types, Zod schemas, Result<T,E>, and the
   unified WatchDataProvider interface.
3. Write unit tests validating all schemas against valid and malformed inputs.
   Phase 1 Gate Command:
   pnpm turbo run build typecheck lint test

PHASE 2: Physiological Math & Correlation Engine (@noop-cmf/physio-engine)
Tasks:

1. Implement Karvonen HR Zone classifier (Zones 1-5), Banister TRIMP, and
   Logarithmic Strain (0.0-21.0).
2. Implement Sleep Architecture analyzer (Efficiency %, Restorative Deep+REM %,
   Dynamic Sleep Need, Sleep Debt).
3. Implement Overnight eHRV estimator and 30-Day Rolling Z-Score Recovery
   calculator (1-99% + Optimal Strain Target).
4. Implement HabitCorrelationEngine computing Recovery % and eHRV impacts for
   daily journal habits.
5. Write unit tests and fast-check property-based tests.
   Phase 2 Gate Command:
   pnpm --filter @noop-cmf/physio-engine test:coverage

PHASE 3: Deterministic 30-Day Biometric Simulator (@noop-cmf/watch-simulator)
Tasks:

1. Implement a seeded mulberry32 PRNG biometric generator producing 30 days of
   1-minute HR samples, circadian sleep dips, sleep stages ('awake', 'light',
   'deep', 'rem'), stress scores, SpO2, and workout sessions.
2. Implement 3 preset personas:
   - "endurance-runner" (road running + cycling cross-training + strength)
   - "peak-recovery" (high sleep efficiency, declining RHR, green recoveries)
   - "overreaching" (sleep debt accumulation, elevated stress/RHR, red/yellow)
3. Implement SimulatedWatchProvider conforming to WatchDataProvider.
   Phase 3 Gate Command:
   pnpm --filter @noop-cmf/watch-simulator test:coverage

PHASE 4: WebBLE Protocol Stack & Gadgetbridge Adapter (@noop-cmf/cmf-ble)
Tasks:

1. Implement CMF Watch Pro 2 BLE protocol layer (Actions ATS3089C / Zephyr spec):
   - Factory AT shell command builder ("AT GETSECRET") and response parser.
   - SHA-256 challenge solver and Web Crypto API (crypto.subtle) AES-128-CBC
     session encryptor/decryptor.
   - Binary frame codec with sequence numbers, MTU chunking, and CRC32 checks.
   - Bulk-data channel parser for timestamped HR, Sleep, Stress, and Workouts.
   - Two-way BLE notification builder (formatRecoveryWatchNotification) to push
     morning Recovery %, eHRV, and Optimal Strain back to the watch display.
2. Implement MockBleTransport simulating watch GATT characteristics in memory.
3. Implement GadgetbridgeSqliteProvider using sql.js (WASM) to parse exported
   Gadgetbridge SQLite files into canonical @noop-cmf/types.
4. Build an automated SQLite fixture generator and full unit test suite.
   Phase 4 Gate Command:
   pnpm --filter @noop-cmf/cmf-ble test:coverage

PHASE 5: Local-First Next.js PWA & Whoop Dark UI (apps/web)
Tasks:

1. Implement Dexie.js IndexedDB storage (hrSamples, stressSamples,
   sleepSegments, workouts, journalEntries, cycles) and a Web Worker for
   off-main-thread SQLite parsing and 30-day rolling math.
2. Configure the Whoop Dark Design System (#0B0E14 background, #121721 card
   surface, #00F19F Recovery Green, #FFBE0B Yellow, #FF0055 Red, #0096FF
   Strain Blue, #7B61FF Sleep Purple).
3. Build the 5 primary routes:
   - Overview (/): Triple SVG gauge rings, 5-metric Health Monitor baseline
     card, Strain vs. Recovery target dial, and 7-day sparklines.
   - Strain (/strain): Logarithmic Strain curve chart, HR Zones 1-5 time bars,
     and workout TRIMP breakdown.
   - Recovery (/recovery): 30-day RHR and eHRV baseline band charts with
     standard deviation shading.
   - Sleep (/sleep): Stepped horizontal Hypnogram, Restorative Sleep breakdown,
     and Tonight's Sleep Need bar.
   - Journal & Sync (/journal, /sync): Morning habit checklist with diverging
     impact bars, WebBLE Pair wizard, "Push Recovery to Watch" button,
     Gadgetbridge .db dropzone, and Demo Persona selector.
     Phase 5 Gate Command:
     pnpm --filter web build && pnpm --filter web typecheck && pnpm --filter web test

PHASE 6: Playwright E2E, Accessibility Audit & GitHub Actions CI
Tasks:

1. Write Playwright E2E tests in apps/web/e2e/ covering:
   - Demo mode boot (?demo=true&persona=endurance-runner) & SVG gauge rendering.
   - Gadgetbridge SQLite .db file upload and IndexedDB persistence across reload.
   - Mock WebBLE pairing and outbound "Push Recovery to Watch" verification.
   - Morning Journal submission and Habit Impact chart recalculation.
   - @axe-core/playwright WCAG AA accessibility assertions on all routes.
2. Create .github/workflows/ci.yml running lint, typecheck, test:coverage, and
   Playwright E2E tests on every push and pull request.
   Phase 6 Gate Command:
   pnpm turbo run lint typecheck test && pnpm --filter web test:e2e
   \================================================================================
