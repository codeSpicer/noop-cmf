import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReadinessChip } from './ReadinessChip';

describe('ReadinessChip', () => {
  afterEach(() => { cleanup(); });

  it('renders loading state when result is null', () => {
    render(<ReadinessChip result={null} />);
    expect(screen.getByTestId('readiness-chip')).toBeInTheDocument();
  });

  it('renders recovered label', () => {
    const result = {
      readinessPercent: 88,
      minutesToReady: 0,
      recovered: true,
    } as unknown as Parameters<typeof ReadinessChip>[0]['result'];
    render(<ReadinessChip result={result} />);
    expect(screen.getByTestId('readiness-chip')).toHaveTextContent('88%');
  });

  it('renders countdown when not recovered', () => {
    const result = {
      readinessPercent: 40,
      minutesToReady: 180,
      recovered: false,
    } as unknown as Parameters<typeof ReadinessChip>[0]['result'];
    render(<ReadinessChip result={result} />);
    expect(screen.getByTestId('readiness-chip')).toHaveTextContent(/to ready/i);
  });
});