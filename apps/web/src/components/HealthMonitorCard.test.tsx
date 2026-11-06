import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HealthMonitorCard } from './HealthMonitorCard';

describe('HealthMonitorCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders loading state', () => {
    render(<HealthMonitorCard metrics={null} />);
    expect(screen.getByText(/Loading health monitor/i)).toBeInTheDocument();
  });

  it('renders 5 metrics', () => {
    render(
      <HealthMonitorCard
        metrics={{ restingHeartRate: 55, stress: 30, spo2: 97, sleepMinutes: 420, steps: 8000 }}
      />,
    );
    expect(screen.getByTestId('health-monitor')).toBeInTheDocument();
    expect(screen.getByTestId('hm-rhr')).toHaveTextContent('55 bpm');
    expect(screen.getByTestId('hm-steps')).toHaveTextContent('8000');
  });
});