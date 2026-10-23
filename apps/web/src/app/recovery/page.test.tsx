import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import RecoveryPage from './page';

describe('RecoveryPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows recovery, eHRV, and RHR in demo mode', async () => {
    window.history.replaceState({}, '', '/recovery?demo=true');
    render(<RecoveryPage />);
    await waitFor(() => {
      expect(screen.getByTestId('recovery-value')).toBeInTheDocument();
    });
    expect(screen.getByTestId('ehrv-value')).toBeInTheDocument();
    expect(screen.getByTestId('rhr-value')).toBeInTheDocument();
  }, 30000);

  it('shows a helpful error outside demo mode', async () => {
    window.history.replaceState({}, '', '/recovery');
    render(<RecoveryPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('demo mode');
  });
});
