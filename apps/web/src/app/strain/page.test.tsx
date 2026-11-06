import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { clearDatabase, getDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import type { HrSample } from '@noop-cmf/types';
import StrainPage from './page';

const T0 = Date.UTC(2024, 0, 30);
function hr(ts: number, bpm: number): HrSample {
  return { timestamp: EpochMsSchema.parse(ts), bpm: bpm as HrSample['bpm'] };
}

describe('StrainPage', () => {
  afterEach(() => { cleanup(); });
  beforeEach(async () => {
    await clearDatabase(getDatabase());
  });

  it('shows an empty state when no data is synced', async () => {
    render(<StrainPage />);
    await waitFor(() => {
      expect(screen.getByText(/No data yet/i)).toBeInTheDocument();
    });
  });

  it('shows trimp when data is synced', async () => {
    const db = getDatabase();
    await db.hrSamples.bulkPut([hr(T0 - 1000, 120), hr(T0 - 500, 130)]);
    render(<StrainPage />);
    await waitFor(() => {
      expect(screen.getByTestId('trimp-value')).toBeInTheDocument();
    });
  });
});