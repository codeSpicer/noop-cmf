import { describe, expect, it } from 'vitest';
import {
  AT_GET_SECRET_COMMAND,
  AT_REBOOT_COMMAND,
  AT_VERSION_COMMAND,
  buildGetSecretCommand,
  buildVersionCommand,
  parseAtResponse,
} from './at-shell.js';

describe('AT command builders', () => {
  it('builds CRLF-terminated GETSECRET', () => {
    expect(buildGetSecretCommand()).toBe(`${AT_GET_SECRET_COMMAND}\r\n`);
  });

  it('builds CRLF-terminated VERSION', () => {
    expect(buildVersionCommand()).toBe(`${AT_VERSION_COMMAND}\r\n`);
  });

  it('exposes the reboot command name', () => {
    expect(AT_REBOOT_COMMAND).toBe('AT REBOOT');
  });
});

describe('parseAtResponse', () => {
  it('parses a GETSECRET success payload', () => {
    const result = parseAtResponse('+GETSECRET:a1b2c3\r\nOK');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.command).toBe('GETSECRET');
      expect(result.value.payload).toBe('a1b2c3');
      expect(result.value.ok).toBe(true);
    }
  });

  it('parses a VERSION success payload', () => {
    const result = parseAtResponse('+VERSION:leopard-v1.2.3\r\nOK');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.command).toBe('VERSION');
      expect(result.value.payload).toBe('leopard-v1.2.3');
    }
  });

  it('parses device error responses', () => {
    const result = parseAtResponse('ERROR:4');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.command).toBe('ERROR');
      expect(result.value.ok).toBe(false);
    }
  });

  it('rejects empty and garbage lines', () => {
    expect(parseAtResponse('').ok).toBe(false);
    expect(parseAtResponse('   ').ok).toBe(false);
    expect(parseAtResponse('hello world').ok).toBe(false);
    expect(parseAtResponse('OK').ok).toBe(false);
    expect(parseAtResponse('+BROKEN\r\nOK').ok).toBe(false);
  });

  it('tolerates LF-only endings', () => {
    const result = parseAtResponse('+GETSECRET:xyz\nOK');
    expect(result.ok).toBe(true);
  });
});
