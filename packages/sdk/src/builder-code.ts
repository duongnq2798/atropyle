import type { Hex } from 'viem';
import { AtropyleError } from './errors';

/** ERC-8021 suffix marker (16 bytes), the last bytes of any tagged calldata. */
export const ERC8021_MARKER = '80218021802180218021802180218021';

const CODE = /^[\x21-\x2b\x2d-\x7e]+$/;

/** codes (ASCII, comma-joined) ‖ codesLength (1 byte) ‖ schemaId 0x00 ‖ marker. Same bytes as ox Attribution.toDataSuffix. */
export function builderCodeSuffix(codes: string | readonly string[]): Hex {
  const list = typeof codes === 'string' ? [codes] : [...codes];
  const body = list.join(',');
  if (list.length === 0 || list.some((c) => !CODE.test(c)) || body.length > 255) {
    throw new AtropyleError('INVALID_OPTIONS', {
      message: 'A builder code is 1 or more printable ASCII characters without commas or spaces (255 bytes in total).',
    });
  }
  let hex = '';
  for (let i = 0; i < body.length; i++) hex += body.charCodeAt(i).toString(16).padStart(2, '0');
  return `0x${hex}${body.length.toString(16).padStart(2, '0')}00${ERC8021_MARKER}`;
}

export function appendSuffix(data: Hex, suffix: Hex | null): Hex {
  return suffix ? (`${data}${suffix.slice(2)}` as Hex) : data;
}

export function parseBuilderCodeSuffix(data: Hex): { codes: string[]; data: Hex } | null {
  const h = data.slice(2).toLowerCase();
  if (!h.endsWith(ERC8021_MARKER)) return null;
  const end = h.length - ERC8021_MARKER.length;
  if (h.slice(end - 2, end) !== '00') return null;
  const len = Number.parseInt(h.slice(end - 4, end - 2), 16);
  const start = end - 4 - len * 2;
  if (!Number.isInteger(len) || start < 0) return null;
  let body = '';
  for (let i = start; i < end - 4; i += 2) body += String.fromCharCode(Number.parseInt(h.slice(i, i + 2), 16));
  return { codes: body.split(','), data: `0x${h.slice(0, start)}` as Hex };
}
