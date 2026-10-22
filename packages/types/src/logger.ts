/**
 * Structured logger contract injected into every package.
 *
 * Direct `console.log` usage is banned in `packages/*`; packages receive a
 * {@link Logger} instead so hosts (CLI, PWA, tests) control log routing.
 */

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
