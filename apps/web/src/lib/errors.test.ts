import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it('returns the error message for Error instances', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('falls back for non-errors and empty messages', () => {
    expect(errorMessage('nope', 'fallback')).toBe('fallback');
    expect(errorMessage(new Error(''), 'fallback')).toBe('fallback');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
    expect(errorMessage(null, 'fallback')).toBe('fallback');
  });
});
