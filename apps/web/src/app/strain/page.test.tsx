import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import StrainPage from './page';

describe('StrainPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows TRIMP and zone bars in demo mode', async () => {
    window.history.replaceState({}, '', '/strain?demo=true');
    render(<StrainPage />);
    await waitFor(() => {
      expect(screen.getByTestId('trimp-value')).toBeInTheDocument();
    });
    expect(screen.getByTestId('zone-bars')).toBeInTheDocument();
  }, 30000);

  it('shows a helpful error outside demo mode', async () => {
    window.history.replaceState({}, '', '/strain');
    render(<StrainPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('demo mode');
  });
});
