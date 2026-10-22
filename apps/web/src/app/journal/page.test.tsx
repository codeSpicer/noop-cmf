import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JournalPage from './page';
import { getDatabase, clearDatabase } from '@/db/database';

describe('JournalPage', () => {
  it('submits a habit entry and persists it', async () => {
    const user = userEvent.setup();
    const db = getDatabase();
    await clearDatabase(db);
    window.history.replaceState({}, '', '/journal');
    render(<JournalPage />);
    await user.click(screen.getByLabelText('alcohol'));
    await user.click(screen.getByTestId('journal-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('journal-saved')).toBeInTheDocument();
    });
    const entries = await db.journalEntries.toArray();
    expect(entries.length).toBeGreaterThan(0);
    await clearDatabase(db);
  });
});
