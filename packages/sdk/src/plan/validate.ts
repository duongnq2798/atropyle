import type { Address } from 'viem';
import { toAddress, ZERO_ADDRESS } from '../address';
import { formatDuration, parseDuration } from '../duration';
import { AtropyleError } from '../errors';
import { parseBigInt } from '../json';
import {
  ASSET_KINDS,
  type Asset,
  type AssetKind,
  type Heir,
  type Timing,
  type VaultParams,
  type Warning,
} from '../types';
import { untrusted } from '../untrusted';
import {
  type GuardianPart,
  LIMITS,
  type PlanConfig,
  type PlanIssue,
  type PlanIssueCode,
  type PlanResult,
  PRESETS,
  type PresetName,
  type SectionContext,
  type SectionResult,
  type TimingInput,
} from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Text taken from the input and echoed in a message: stripped of hidden characters and cut short. */
const shown = (s: string, max = 40): string => untrusted(s, max).value || '(blank)';

class Issues {
  readonly list: PlanIssue[] = [];
  add(path: string, code: PlanIssueCode, message: string): void {
    this.list.push({ path, code, message });
  }
}

function unknownKeys(o: Obj, allowed: readonly string[], path: string, issues: Issues): void {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) {
      const at = path ? `${path}.${shown(k)}` : shown(k);
      issues.add(at, 'UNKNOWN_FIELD', `${at}: unknown field`);
    }
  }
}

function addressAt(v: unknown, path: string, issues: Issues): Address | null {
  let a: Address;
  try {
    a = toAddress(v, path);
  } catch {
    issues.add(path, 'INVALID_ADDRESS', `${path}: not a valid address`);
    return null;
  }
  if (a === ZERO_ADDRESS) {
    issues.add(path, 'ZERO_ADDRESS', `${path}: the zero address is not allowed`);
    return null;
  }
  return a;
}

function normalized(a: Address): Address {
  try {
    return toAddress(a, 'address');
  } catch {
    return a;
  }
}

export function planError(issues: PlanIssue[]): AtropyleError {
  const first = issues[0];
  return new AtropyleError('PLAN_INVALID', {
    message: first
      ? `The plan is invalid: ${first.message.replace(/\.$/, '')}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}.`
      : undefined,
    details: { issues },
  });
}

/** Percent shares → bps summing to exactly 10000; the rounding remainder goes to the first heir. */
export function sharesToBps(percents: readonly number[]): number[] {
  if (percents.length === 0 || percents.some((p) => !Number.isFinite(p) || p <= 0)) {
    throw new AtropyleError('PLAN_INVALID', { message: 'Every share must be a number above 0.' });
  }
  const bps = percents.map((p) => Math.floor(p * 100 + 1e-9));
  const rest = LIMITS.bps - bps.reduce((a, b) => a + b, 0);
  if (Math.abs(rest) > percents.length || bps[0] + rest <= 0) {
    throw new AtropyleError('PLAN_INVALID', { message: 'Percent shares must add up to 100.' });
  }
  bps[0] += rest;
  // The contract rejects a share of 0 bps, so a share below 0.01% cannot be kept.
  if (bps.some((b) => b < 1)) {
    throw new AtropyleError('PLAN_INVALID', { message: 'Every share must be at least 0.01%.' });
  }
  return bps;
}

function parseHeirs(
  v: unknown,
  owner: Address | null,
  vault: Address | null,
  issues: Issues,
  path = 'heirs',
): Heir[] | null {
  if (!Array.isArray(v)) {
    issues.add(path, 'REQUIRED', `${path}: list 1 to ${LIMITS.maxHeirs} heirs`);
    return null;
  }
  if (v.length === 0 || v.length > LIMITS.maxHeirs) {
    issues.add(path, 'HEIRS_COUNT', `${path}: list 1 to ${LIMITS.maxHeirs} heirs (got ${v.length})`);
    return null;
  }
  const before = issues.list.length;
  const accounts: (Address | null)[] = [];
  v.forEach((h, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(h)) {
      issues.add(p, 'TYPE', `${p}: expected { account, bps } or { account, percent }`);
      accounts.push(null);
      return;
    }
    unknownKeys(h, ['account', 'bps', 'percent'], p, issues);
    const a = addressAt(h.account, `${p}.account`, issues);
    if (a && owner && a === owner)
      issues.add(`${p}.account`, 'HEIR_IS_OWNER', `${p}.account: the owner cannot be an heir`);
    // The vault rejects itself as an heir: a share sent to it could never be withdrawn.
    else if (a && vault && a === vault)
      issues.add(`${p}.account`, 'HEIR_IS_VAULT', `${p}.account: the vault itself cannot be an heir`);
    else if (a && accounts.includes(a))
      issues.add(`${p}.account`, 'DUPLICATE', `${p}.account: this heir is listed twice`);
    accounts.push(a);
  });
  const objs = v.filter(isObj);
  const usesBps = objs.some((h) => h.bps !== undefined);
  const usesPercent = objs.some((h) => h.percent !== undefined);
  let bps: number[] | null = null;
  if (usesBps && usesPercent) {
    issues.add(path, 'SHARE_FORMAT', `${path}: use either bps or percent for every heir, not both`);
  } else if (usesBps) {
    const values = v.map((h) => (isObj(h) ? h.bps : undefined));
    let each = true;
    values.forEach((x, i) => {
      if (x === 0) {
        each = false;
        issues.add(`${path}[${i}].bps`, 'SHARE_ZERO', `${path}[${i}].bps: a share of 0 is not allowed`);
      } else if (!(Number.isInteger(x) && (x as number) > 0 && (x as number) <= LIMITS.bps)) {
        each = false;
        issues.add(`${path}[${i}].bps`, 'TYPE', `${path}[${i}].bps: must be a whole number from 1 to 10000`);
      }
    });
    if (each) {
      const sum = (values as number[]).reduce((a, b) => a + b, 0);
      if (sum === LIMITS.bps) bps = values as number[];
      else issues.add(path, 'SHARES_SUM', `${path}: bps must add up to 10000 (got ${sum})`);
    }
  } else if (usesPercent) {
    const values = v.map((h) => (isObj(h) ? h.percent : undefined));
    const bad = values.findIndex((x) => !(typeof x === 'number' && Number.isFinite(x) && x > 0));
    if (bad >= 0) {
      const code = values[bad] === 0 ? 'SHARE_ZERO' : 'TYPE';
      issues.add(`${path}[${bad}].percent`, code, `${path}[${bad}].percent: must be a number above 0`);
    } else {
      try {
        bps = sharesToBps(values as number[]);
      } catch (e) {
        issues.add(
          path,
          'SHARES_SUM',
          `${path}: ${e instanceof Error ? e.message : 'percent shares must add up to 100'}`,
        );
      }
    }
  } else if (v.length === 1) {
    bps = [LIMITS.bps];
  } else {
    issues.add(path, 'SHARES_SUM', `${path}: give every heir a bps or percent share`);
  }
  if (issues.list.length > before || !bps) return null;
  return accounts.map((a, i) => ({ account: a as Address, bps: (bps as number[])[i] }));
}

function parseGuardians(
  gv: unknown,
  kv: unknown,
  rv: unknown,
  owner: Address | null,
  vault: Address | null,
  issues: Issues,
): GuardianPart | null {
  const before = issues.list.length;
  const list = gv === undefined ? [] : gv;
  const guardians: Address[] = [];
  if (!Array.isArray(list)) issues.add('guardians', 'TYPE', 'guardians: expected a list of addresses');
  else if (list.length > LIMITS.maxGuardians) {
    issues.add('guardians', 'GUARDIANS_COUNT', `guardians: at most ${LIMITS.maxGuardians} (got ${list.length})`);
  } else {
    list.forEach((g, i) => {
      const p = `guardians[${i}]`;
      const a = addressAt(g, p, issues);
      if (!a) return;
      if (owner && a === owner) issues.add(p, 'GUARDIAN_IS_OWNER', `${p}: the owner cannot be a guardian`);
      // The vault can never sign, so the contract rejects it as a guardian too.
      else if (vault && a === vault) issues.add(p, 'GUARDIAN_IS_VAULT', `${p}: the vault itself cannot be a guardian`);
      else if (guardians.includes(a)) issues.add(p, 'DUPLICATE', `${p}: this guardian is listed twice`);
      else guardians.push(a);
    });
  }
  const n = Array.isArray(list) ? list.length : 0;
  const recoveryEnabled = rv === undefined ? false : rv;
  if (typeof recoveryEnabled !== 'boolean')
    issues.add('recoveryEnabled', 'TYPE', 'recoveryEnabled: expected true or false');
  // null: k is missing or out of range and already reported.
  let k: number | null = 0;
  if (kv === undefined) {
    if (n > 0) {
      issues.add('k', 'REQUIRED', `k: how many guardians must confirm (1 to ${n})`);
      k = null;
    }
  } else if (!Number.isInteger(kv) || (kv as number) < 0 || (kv as number) > n) {
    issues.add('k', 'K_RANGE', `k: must be a whole number from 0 to ${n}`);
    k = null;
  } else {
    k = kv as number;
  }
  if (recoveryEnabled === true && k === 0) {
    issues.add('recoveryEnabled', 'RECOVERY_NEEDS_K', 'recoveryEnabled: wallet recovery needs k of at least 1');
  }
  if (issues.list.length > before || k === null) return null;
  return { guardians, k, recoveryEnabled: recoveryEnabled as boolean };
}

function durationAt(v: unknown, path: string, issues: Issues): number | null {
  try {
    return parseDuration(v as string | number, path);
  } catch {
    issues.add(path, 'TYPE', `${path}: expected seconds or a duration like 30d`);
    return null;
  }
}

function parseTiming(v: unknown, drill: boolean, issues: Issues): Timing | null {
  const before = issues.list.length;
  let t: Timing | null = null;
  if (typeof v === 'string') {
    // Own keys only: 'toString' or 'constructor' must not resolve to something inherited.
    if (Object.hasOwn(PRESETS, v)) t = { ...PRESETS[v as PresetName] };
    else
      issues.add(
        'timing',
        'UNKNOWN_PRESET',
        `timing: unknown preset "${shown(v, 32)}" (use drill, sixMonths or twelveMonths)`,
      );
  } else if (isObj(v)) {
    unknownKeys(v, ['period', 'threshold', 'window'], 'timing', issues);
    const period = durationAt(v.period, 'timing.period', issues);
    const window = durationAt(v.window, 'timing.window', issues);
    const threshold = v.threshold;
    if (!Number.isInteger(threshold) || (threshold as number) < 1 || (threshold as number) > LIMITS.maxThreshold) {
      issues.add(
        'timing.threshold',
        'THRESHOLD_RANGE',
        `timing.threshold: must be a whole number from 1 to ${LIMITS.maxThreshold}`,
      );
    }
    if (period !== null && window !== null && issues.list.length === before) {
      t = { period, threshold: threshold as number, window };
    }
  } else {
    issues.add('timing', 'REQUIRED', 'timing: give a preset name or { period, threshold, window }');
  }
  if (!t) return null;
  const minP = drill ? LIMITS.drillMin : LIMITS.minPeriod;
  const minW = drill ? LIMITS.drillMin : LIMITS.minWindow;
  if (t.period > LIMITS.maxUint32)
    issues.add('timing.period', 'DURATION_MAX', 'timing.period: too long (max 4294967295 seconds)');
  else if (t.period < minP) {
    issues.add(
      'timing.period',
      'PERIOD_MIN',
      `timing.period: must be at least ${formatDuration(minP)} (got ${formatDuration(t.period)})`,
    );
  }
  if (t.window > LIMITS.maxUint32)
    issues.add('timing.window', 'DURATION_MAX', 'timing.window: too long (max 4294967295 seconds)');
  else if (t.window < minW) {
    issues.add(
      'timing.window',
      'WINDOW_MIN',
      `timing.window: must be at least ${formatDuration(minW)} (got ${formatDuration(t.window)})`,
    );
  }
  return issues.list.length > before ? null : t;
}

const MAX_UINT256 = 2n ** 256n - 1n;

function parseAssets(v: unknown, heirCount: number | null, issues: Issues): Asset[] | null {
  const before = issues.list.length;
  const list = v === undefined ? [] : v;
  if (!Array.isArray(list)) {
    issues.add('assets', 'TYPE', 'assets: expected a list');
    return null;
  }
  if (list.length > LIMITS.maxAssets) {
    issues.add('assets', 'ASSETS_COUNT', `assets: at most ${LIMITS.maxAssets} (got ${list.length})`);
    return null;
  }
  const out: Asset[] = [];
  list.forEach((a, i) => {
    const p = `assets[${i}]`;
    if (!isObj(a)) {
      issues.add(p, 'TYPE', `${p}: expected { kind, token, id?, heir? }`);
      return;
    }
    unknownKeys(a, ['kind', 'token', 'id', 'heir'], p, issues);
    const kind = a.kind as AssetKind;
    if (!ASSET_KINDS.includes(kind)) issues.add(`${p}.kind`, 'ASSET_KIND', `${p}.kind: use erc20, erc721 or erc1155`);
    const token = addressAt(a.token, `${p}.token`, issues);
    let id = 0n;
    if (a.id !== undefined) {
      try {
        id = parseBigInt(a.id, `${p}.id`);
        if (id > MAX_UINT256) throw new Error('too big');
      } catch {
        issues.add(`${p}.id`, 'TYPE', `${p}.id: expected a token id (whole number)`);
      }
    }
    if (kind === 'erc20' && id !== 0n) issues.add(`${p}.id`, 'ERC20_ID_NONZERO', `${p}.id: ERC-20 entries use id 0`);
    const heir = a.heir === undefined ? 0 : a.heir;
    if (!Number.isInteger(heir) || (heir as number) < 0)
      issues.add(`${p}.heir`, 'TYPE', `${p}.heir: expected an heir index`);
    else if (heirCount !== null && (heir as number) >= heirCount) {
      issues.add(`${p}.heir`, 'ASSET_HEIR_RANGE', `${p}.heir: there is no heir #${heir} (heirs are numbered from 0)`);
    }
    if (token && out.some((x) => x.token === token && x.id === id))
      issues.add(p, 'DUPLICATE', `${p}: this token and id are listed twice`);
    if (token) out.push({ kind, token, id, heir: heir as number });
  });
  return issues.list.length > before ? null : out;
}

function planWarnings(c: PlanConfig): Warning[] {
  const w: Warning[] = [];
  if (c.k === 0) {
    w.push({
      code: 'NO_GUARDIANS',
      message: `No guardian confirmation is needed: if ${c.timing.threshold} check-ins (every ${formatDuration(c.timing.period)}) are missed and the ${formatDuration(c.timing.window)} alarm window ends, the assets release automatically.`,
    });
  }
  if (c.drill) {
    w.push({
      code: 'DRILL_NOT_FOR_REAL_ASSETS',
      message: 'This is a Drill: it expires 7 days after creation and is meant for practice.',
    });
  }
  return w;
}

const TOP = ['version', 'owner', 'drill', 'heirs', 'guardians', 'k', 'recoveryEnabled', 'timing', 'assets'] as const;

export function validatePlan(
  input: unknown,
  ctx: { owner?: string | null; drill?: boolean; vault?: string | null } = {},
): PlanResult {
  if (!isObj(input))
    return { ok: false, issues: [{ path: '', code: 'TYPE', message: 'The plan must be a JSON object.' }] };
  const issues = new Issues();
  unknownKeys(input, TOP, '', issues);
  if (input.version !== undefined && input.version !== 1)
    issues.add('version', 'TYPE', 'version: only version 1 is supported');
  const ownerRaw = ctx.owner !== undefined ? ctx.owner : input.owner;
  const owner = ownerRaw === undefined || ownerRaw === null ? null : addressAt(ownerRaw, 'owner', issues);
  // At creation this is factory.predictVault(owner, salt); without it the vault-address checks are skipped.
  const vault = ctx.vault === undefined || ctx.vault === null ? null : addressAt(ctx.vault, 'vault', issues);
  const drillRaw = ctx.drill ?? input.drill ?? false;
  if (typeof drillRaw !== 'boolean') issues.add('drill', 'TYPE', 'drill: expected true or false');
  const drill = drillRaw === true;
  const heirs = parseHeirs(input.heirs, owner, vault, issues);
  const g = parseGuardians(input.guardians, input.k, input.recoveryEnabled, owner, vault, issues);
  const timing = parseTiming(input.timing, drill, issues);
  const heirCount = heirs
    ? heirs.length
    : Array.isArray(input.heirs) && input.heirs.length > 0
      ? input.heirs.length
      : null;
  const assets = parseAssets(input.assets, heirCount, issues);
  if (issues.list.length > 0 || !heirs || !g || !timing || !assets) return { ok: false, issues: issues.list };
  const config: PlanConfig = { owner, drill, heirs, ...g, timing, assets };
  return { ok: true, config, warnings: planWarnings(config) };
}

export function resolveTiming(input: TimingInput, drill: boolean): Timing {
  const issues = new Issues();
  const t = parseTiming(input, drill, issues);
  if (!t) throw planError(issues.list);
  return t;
}

/** Validates one section of an existing vault (setHeirs / setGuardians / setAssets) and returns it normalized. */
export function validateSection(kind: 'heirs', input: unknown, ctx: SectionContext): SectionResult<Heir[]>;
export function validateSection(kind: 'guardians', input: unknown, ctx: SectionContext): SectionResult<GuardianPart>;
export function validateSection(kind: 'assets', input: unknown, ctx: SectionContext): SectionResult<Asset[]>;
export function validateSection(
  kind: 'heirs' | 'guardians' | 'assets',
  input: unknown,
  ctx: SectionContext,
): SectionResult<Heir[] | GuardianPart | Asset[]> {
  const issues = new Issues();
  let value: Heir[] | GuardianPart | Asset[] | null;
  // Compare in checksum form: a lowercase owner or vault must still be caught as an heir or guardian.
  const owner = normalized(ctx.owner);
  const vault = ctx.vault ? normalized(ctx.vault) : null;
  if (kind === 'heirs') value = parseHeirs(input, owner, vault, issues);
  else if (kind === 'guardians')
    value = parseGuardians(input, ctx.k ?? 0, ctx.recoveryEnabled ?? false, owner, vault, issues);
  else value = parseAssets(input, ctx.heirCount, issues);
  return { issues: issues.list, value: issues.list.length > 0 ? null : value };
}

export function toVaultParams(c: PlanConfig): VaultParams {
  return {
    heirs: c.heirs,
    guardians: c.guardians,
    k: c.k,
    recoveryEnabled: c.recoveryEnabled,
    timing: c.timing,
    assets: c.assets,
  };
}
