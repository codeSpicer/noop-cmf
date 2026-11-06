import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReadinessCard } from './ReadinessCard';

describe('ReadinessCard', () => {
  afterEach(() => { cleanup(); });

  it('renders loading state when result is null', () => {
    render(<ReadinessCard result={null} />);
    expect(screen.getByText(/Loading readiness/i)).toBeInTheDocument();
  });

  it('renders readiness value and countdown', () => {
    const result = {
      readinessPercent: 72,
      minutesToReady: 120,
      recovered: false,
    } as unknown as Parameters<typeof ReadinessCard>[0]['result'];
    render(<ReadinessCard result={result} />);
    expect(screen.getByTestId('readiness-value')).toHaveTextContent('72%');
    expect(screen.getByTestId('readiness-countdown')).toHaveTextContent(/Ready in/i);
    expect(screen.getByTestId('readiness-progress')).toBeInTheDocument();
  });

  it('shows recovered state when done', () => {
    const result = {
      readinessPercent: 90,
      minutesToReady: 0,
      recovered: true,
    } as unknown as Parameters<typeof ReadinessCard>[0]['result'];
    render(<ReadinessCard result={result} />);
    expect(screen.getByTestId('readiness-recovered')).toHaveTextContent(/Fully recovered/i);
  });
});