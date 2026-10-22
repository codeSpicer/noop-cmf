import { describe, expect, it } from 'vitest';
import {
  andThen,
  err,
  isErr,
  isOk,
  map,
  mapError,
  ok,
  unwrapOr,
  unwrapOrElse,
  type Result,
} from './result.js';

describe('ok and err constructors', () => {
  it('creates a successful result', () => {
    const result = ok(42);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('creates a failed result', () => {
    const result = err('boom');
    expect(result).toEqual({ ok: false, error: 'boom' });
  });
});

describe('narrowing helpers', () => {
  it('isOk narrows to the success branch', () => {
    const result: Result<number, string> = ok(7);
    if (isOk(result)) {
      expect(result.value).toBe(7);
      expect(isErr(result)).toBe(false);
    } else {
      throw new Error('Expected ok result');
    }
  });

  it('isErr narrows to the failure branch', () => {
    const result: Result<number, string> = err('nope');
    if (isErr(result)) {
      expect(result.error).toBe('nope');
      expect(isOk(result)).toBe(false);
    } else {
      throw new Error('Expected err result');
    }
  });
});

describe('map', () => {
  it('transforms the success value', () => {
    expect(map(ok(2), (value) => value * 3)).toEqual(ok(6));
  });

  it('passes errors through untouched', () => {
    expect(map(err('bad'), (value: number) => value * 3)).toEqual(err('bad'));
  });
});

describe('andThen', () => {
  it('chains successful computations', () => {
    const result = andThen(ok(10), (value) => ok(value + 5));
    expect(result).toEqual(ok(15));
  });

  it('short-circuits on an initial error', () => {
    let called = false;
    const initial: Result<string, string> = err('first');
    const result = andThen(initial, () => {
      called = true;
      return ok('second');
    });
    expect(result).toEqual(err('first'));
    expect(called).toBe(false);
  });

  it('propagates an error from the chained function', () => {
    const result = andThen(ok('x'), () => err('chained'));
    expect(result).toEqual(err('chained'));
  });
});

describe('mapError', () => {
  it('keeps success values untouched', () => {
    expect(mapError(ok(1), (error: string) => error.length)).toEqual(ok(1));
  });

  it('transforms the error', () => {
    expect(mapError(err('oops'), (error) => error.length)).toEqual(err(4));
  });
});

describe('unwrap helpers', () => {
  it('unwrapOr returns the value or the fallback', () => {
    expect(unwrapOr(ok('a'), 'b')).toBe('a');
    expect(unwrapOr(err('x'), 'b')).toBe('b');
  });

  it('unwrapOrElse returns the value or computes a fallback', () => {
    expect(unwrapOrElse(ok(1), () => 2)).toBe(1);
    expect(unwrapOrElse(err('e'), (error) => error.length)).toBe(1);
  });
});
