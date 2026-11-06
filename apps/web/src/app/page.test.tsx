import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { clearDatabase, getDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import type { HrSample, SleepSegment } from '@noop-cmf/types';
import OverviewPage from './page';

const T0 = Date.UTC(2024, 0, 30);

function hr(ts: number, bpm: number): HrSample {
  return { timestamp: EpochMsSchema.parse(ts), bpm: bpm as HrSample['bpm'] };
}
function sl(start: number, end: number): SleepSegment {
  return { start: EpochMsSchema.parse(start), end: EpochMsSchema.parse(end), stage: 'deep' };
}

describe('OverviewPage', () => {
  afterEach(() => {
    cleanup();
  });
  beforeEach(async () => {
    await clearDatabase(getDatabase());
  });

  it('shows an empty state when no data is synced', async () => {
    render(<OverviewPage />);
    await waitFor(() => {
      expect(screen.getByText(/No data yet/i)).toBeInTheDocument();
    });
  });

  it('renders gauges when data is synced', async () => {
    const db = getDatabase();
    await db.hrSamples.bulkPut([hr(T0 - 1000, 120), hr(T0 - 500, 130)]);
    await db.sleepSegments.put(sl(T0 - 3600000, T0 - 1800000));
    render(<OverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId('strain-ring')).toBeInTheDocument();
    });
  });
});