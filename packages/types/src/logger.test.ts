import { describe, expect, it, vi } from 'vitest';
import { noopLogger, type Logger } from './logger.js';

describe('Logger contract', () => {
  it('accepts a custom implementation with all four methods', () => {
    const debug = vi.fn();
    const info = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();
    const logger: Logger = { debug, info, warn, error };

    logger.debug('d', { requestId: 'a' });
    logger.info('i');
    logger.warn('w', { retry: 1 });
    logger.error('e', { fatal: true });

    expect(debug).toHaveBeenCalledWith('d', { requestId: 'a' });
    expect(info).toHaveBeenCalledWith('i');
    expect(warn).toHaveBeenCalledWith('w', { retry: 1 });
    expect(error).toHaveBeenCalledWith('e', { fatal: true });
  });
});

describe('noopLogger', () => {
  it('silently accepts all log levels without throwing', () => {
    expect(() => {
      noopLogger.debug('debug message', { key: 'value' });
      noopLogger.info('info message');
      noopLogger.warn('warn message', { count: 3 });
      noopLogger.error('error message', { fatal: false });
    }).not.toThrow();
  });
});
