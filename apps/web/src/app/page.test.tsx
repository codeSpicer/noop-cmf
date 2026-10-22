import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import OverviewPage from './page';

describe('OverviewPage', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders the triple gauge rings in demo mode', async () => {
    window.history.replaceState({}, '', '/?demo=true&persona=endurance-runner');
    render(<OverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId('strain-ring')).toBeInTheDocument();
    });
    expect(screen.getByTestId('recovery-ring')).toBeInTheDocument();
    expect(screen.getByTestId('sleep-ring')).toBeInTheDocument();
    expect(screen.getByTestId('strain-target')).toBeInTheDocument();
    expect(screen.getByTestId('strain-spark')).toBeInTheDocument();
  }, 30000);

  it('asks for demo mode when the flag is missing', async () => {
    window.history.replaceState({}, '', '/');
    render(<OverviewPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('demo mode');
    });
  });
});
