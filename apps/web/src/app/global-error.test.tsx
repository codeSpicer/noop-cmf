import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import GlobalError from './global-error';

describe('GlobalError', () => {
  afterEach(cleanup);

  it('renders a full-page fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('falls back when the error message is empty', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<GlobalError error={new Error('')} reset={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('An unexpected error occurred.');
  });
});
