/**
 * Factory AT shell command builder and response parser.
 *
 * The factory shell is a plain-text CRLF protocol spoken over the vendor
 * write/notify channel; commands below are derived from the Actions ATS3089C
 * family convention. Nothing here touches the radio — it only builds and
 * parses strings.
 */
import { ok, err, type Result } from '@noop-cmf/types';

/** Line terminator for AT commands and responses. */
export const AT_LINE_ENDING = '\r\n';

/** AT error codes the device may report. */
export const AT_ERROR_PREFIX = 'ERROR';
export const AT_OK_TOKEN = 'OK';

/** Supported AT command names. */
export const AT_GET_SECRET_COMMAND = 'AT GETSECRET';
export const AT_VERSION_COMMAND = 'AT VERSION';
export const AT_REBOOT_COMMAND = 'AT REBOOT';

/** Parsed form of a single AT response line. */
export interface AtResponse {
  readonly command: string;
  readonly payload: string;
  readonly ok: boolean;
}

/**
 * Build a `AT GETSECRET` command requesting the pairing secret.
 */
export function buildGetSecretCommand(): string {
  return `${AT_GET_SECRET_COMMAND}${AT_LINE_ENDING}`;
}

/**
 * Build an `AT VERSION` command requesting firmware identification.
 */
export function buildVersionCommand(): string {
  return `${AT_VERSION_COMMAND}${AT_LINE_ENDING}`;
}

/**
 * Parse one AT response line such as `+GETSECRET:abc123\r\nOK` or `ERROR:4`.
 */
export function parseAtResponse(line: string): Result<AtResponse, string> {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return err('Empty AT response');
  }
  if (trimmed.startsWith(AT_ERROR_PREFIX)) {
    return ok({ command: 'ERROR', payload: trimmed.slice(AT_ERROR_PREFIX.length), ok: false });
  }
  const normalized = trimmed.replace(/\r/g, '');
  if (normalized.endsWith(AT_OK_TOKEN)) {
    const body = normalized.slice(0, -AT_OK_TOKEN.length).trim();
    const match = /^\+([A-Z0-9_]+):(.*)$/s.exec(body);
    if (!match || match[1] === undefined || match[2] === undefined) {
      return err(`Unrecognised AT success payload: ${body}`);
    }
    return ok({ command: match[1], payload: match[2].trim(), ok: true });
  }
  return err(`Unrecognised AT response: ${trimmed}`);
}
