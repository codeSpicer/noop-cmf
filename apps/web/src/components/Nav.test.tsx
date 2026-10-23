import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Nav } from './Nav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/strain',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('Nav', () => {
  afterEach(cleanup);

  it('marks the active route and renders every link', () => {
    render(<Nav />);
    expect(screen.getByRole('link', { name: 'noop-cmf' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Strain' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Sync' })).toBeInTheDocument();
  });
});
