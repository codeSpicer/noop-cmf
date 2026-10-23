import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import SleepPage from './page';

describe('SleepPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the hypnogram and sleep need in demo mode', async () => {
    window.history.replaceState({}, '', '/sleep?demo=true');
    render(<SleepPage />);
    await waitFor(() => {
      expect(screen.getByTestId('hypnogram')).toBeInTheDocument();
    });
    expect(screen.getByTestId('sleep-need')).toBeInTheDocument();
  }, 30000);

  it('shows a helpful error outside demo mode', async () => {
    window.history.replaceState({}, '', '/sleep');
    render(<SleepPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('demo mode');
  });
});
