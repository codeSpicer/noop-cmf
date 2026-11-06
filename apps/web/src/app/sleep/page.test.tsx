import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { clearDatabase, getDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import type { SleepSegment } from '@noop-cmf/types';
import SleepPage from './page';

const T0 = Date.UTC(2024, 0, 30);
function sl(start: number, end: number): SleepSegment {
  return { start: EpochMsSchema.parse(start), end: EpochMsSchema.parse(end), stage: 'deep' };
}

describe('SleepPage', () => {
  afterEach(() => { cleanup(); });
  beforeEach(async () => {
    await clearDatabase(getDatabase());
  });

  it('shows an empty state when no data is synced', async () => {
    render(<SleepPage />);
    await waitFor(() => {
      expect(screen.getByText(/No data yet/i)).toBeInTheDocument();
    });
  });

  it('shows hypnogram when data is synced', async () => {
    const db = getDatabase();
    await db.sleepSegments.put(sl(T0 - 3600000, T0 - 1800000));
    render(<SleepPage />);
    await waitFor(() => {
      expect(screen.getByTestId('hypnogram')).toBeInTheDocument();
    });
  });
});