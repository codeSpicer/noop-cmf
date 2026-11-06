import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BaselineBandChart, baselineBandPoints } from './BaselineBandChart';

describe('BaselineBandChart', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders svg', () => {
    render(<BaselineBandChart values={[1, 2, 3, 4]} mean={2.5} stdDev={1} testId="band" />);
    expect(screen.getByTestId('band')).toBeInTheDocument();
  });

  it('exports points', () => {
    const pts = baselineBandPoints([1, 2, 3]);
    expect(pts).toHaveLength(3);
  });
});