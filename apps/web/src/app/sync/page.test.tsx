import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SyncPage from './page';

describe('SyncPage', () => {
  afterEach(() => {
    cleanup();
  });
  it('offers persona selection and the dropzone', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/sync');
    render(<SyncPage />);
    expect(screen.getByTestId('persona-select')).toBeInTheDocument();
    expect(screen.getByTestId('db-dropzone')).toBeInTheDocument();
    expect(screen.getByTestId('push-recovery')).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId('persona-select'), 'peak-recovery');
    expect(screen.getByTestId('persona-select')).toHaveValue('peak-recovery');
  });

  it('runs a demo sync end to end', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/sync?demo=true');
    render(<SyncPage />);
    await user.click(screen.getByTestId('demo-sync'));
    await screen.findByText(/Synced .* HR samples/, {}, { timeout: 30000 });
  }, 40000);

  it('pushes recovery to the watch', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/sync?demo=true');
    render(<SyncPage />);
    await user.click(screen.getByTestId('push-recovery'));
    await screen.findByText('Recovery pushed to watch.', {}, { timeout: 30000 });
  }, 40000);
});
