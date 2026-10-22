/**
 * Demo-mode provider factory: reads `?demo=true&persona=<id>` search params
 * and returns a connected SimulatedWatchProvider backed by generated data.
 */
import { EpochMsSchema } from '@noop-cmf/types';
import { SimulatedWatchProvider, type PersonaId } from '@noop-cmf/watch-simulator';

const DEMO_PERSONAS: readonly PersonaId[] = ['endurance-runner', 'peak-recovery', 'overreaching'];
const DEMO_DAYS = 30;
const DEMO_ANCHOR_MS = Date.UTC(2024, 0, 1, 0, 0, 0);

/** True when the URL requests demo mode (`?demo=true`). */
export function isDemoMode(search: string): boolean {
  return new URLSearchParams(search).get('demo') === 'true';
}

/** Persona from `?persona=<id>`, defaulting to endurance-runner. */
export function demoPersona(search: string): PersonaId {
  const raw = new URLSearchParams(search).get('persona');
  if (raw === 'peak-recovery' || raw === 'overreaching' || raw === 'endurance-runner') {
    return raw;
  }
  return 'endurance-runner';
}

/** All personas offered by the demo selector. */
export function demoPersonas(): readonly PersonaId[] {
  return DEMO_PERSONAS;
}

/** Build a connected demo provider plus its backing dataset range. */
export async function createDemoProvider(search: string): Promise<SimulatedWatchProvider> {
  const persona = demoPersona(search);
  const anchorEpochMs = EpochMsSchema.parse(DEMO_ANCHOR_MS);
  const provider = new SimulatedWatchProvider({
    persona,
    seed: 42,
    anchorEpochMs,
    days: DEMO_DAYS,
  });
  await provider.connect();
  return provider;
}
