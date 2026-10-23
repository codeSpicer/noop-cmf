import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorPage from './error';

describe('ErrorPage', () => {
  afterEach(cleanup);

  it('shows the message and supports retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reset = vi.fn();
    render(<ErrorPage error={new Error('boom')} reset={reset} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('falls back when the error message is empty', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<ErrorPage error={new Error('')} reset={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('An unexpected error occurred.');
  });
});
