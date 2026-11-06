import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { clearDatabase, getDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import type { HrSample, SleepSegment } from '@noop-cmf/types';
import RecoveryPage from './page';

const T0 = Date.UTC(2024, 0, 30);
function hr(ts: number, bpm: number): HrSample {
  return { timestamp: EpochMsSchema.parse(ts), bpm: bpm as HrSample['bpm'] };
}
function sl(start: number, end: number): SleepSegment {
  return { start: EpochMsSchema.parse(start), end: EpochMsSchema.parse(end), stage: 'deep' };
}

describe('RecoveryPage', () => {
  afterEach(() => { cleanup(); });
  beforeEach(async () => {
    await clearDatabase(getDatabase());
  });

  it('shows an empty state when no data is synced', async () => {
    render(<RecoveryPage />);
    await waitFor(() => {
      expect(screen.getByText(/No data yet/i)).toBeInTheDocument();
    });
  });

  it('shows recovery when data is synced', async () => {
    const db = getDatabase();
    await db.hrSamples.bulkPut([hr(T0 - 1000, 120)]);
    await db.sleepSegments.put(sl(T0 - 3600000, T0 - 1800000));
    render(<RecoveryPage />);
    await waitFor(() => {
      expect(screen.getByTestId('recovery-value')).toBeInTheDocument();
    });
  });
});