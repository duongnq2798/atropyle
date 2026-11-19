import { toAddress } from '../address';
import { AtropyleError } from '../errors';
import { parseBigInt } from '../json';
import type { ScanCursor } from './scan';
import type { StatsCursor } from './stats';

function bad(path: string): AtropyleError {
  return new AtropyleError('INVALID_OPTIONS', {
    message: `${path}: not a valid cursor; pass back the cursor a previous call returned (it may have been through JSON).`,
    details: { path },
  });
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw bad(path);
  return v as Record<string, unknown>;
}

function block(v: unknown, path: string): bigint {
  try {
    return parseBigInt(v, path);
  } catch {
    throw bad(path);
  }
}

function address(v: unknown, path: string) {
  try {
    return toAddress(v, path);
  } catch {
    throw bad(path);
  }
}

function list(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw bad(path);
  return v;
}

function count(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw bad(path);
  return v;
}

/** A scan cursor as the SDK writes it, or after JSON (stringify turns the block into a decimal string). */
export function parseScanCursor(v: unknown): ScanCursor {
  const c = obj(v, 'resume');
  return {
    toBlock: block(c.toBlock, 'resume.toBlock'),
    vaults: list(c.vaults, 'resume.vaults').map((a, i) => address(a, `resume.vaults[${i}]`)),
  };
}

export function parseStatsCursor(v: unknown): StatsCursor {
  const c = obj(v, 'resume');
  return {
    toBlock: block(c.toBlock, 'resume.toBlock'),
    vaults: list(c.vaults, 'resume.vaults').map((x, i) => {
      const e = obj(x, `resume.vaults[${i}]`);
      if (typeof e.drill !== 'boolean') throw bad(`resume.vaults[${i}].drill`);
      return {
        vault: address(e.vault, `resume.vaults[${i}].vault`),
        owner: address(e.owner, `resume.vaults[${i}].owner`),
        drill: e.drill,
      };
    }),
    aliveEvents: count(c.aliveEvents, 'resume.aliveEvents'),
    alarms: count(c.alarms, 'resume.alarms'),
    releases: count(c.releases, 'resume.releases'),
    distributions: count(c.distributions, 'resume.distributions'),
  };
}
