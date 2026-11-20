import type { VaultActionInput } from '@atropyle/mcp/ops';
import { toAddress } from '@atropyle/sdk';
import { type ActionFlags, durationArg, givenFlags, intArg } from './args';
import { redactUrl, UsageError } from './exit';

type VaultActionType = VaultActionInput['type'];
// Derived from the zod schema of the ops layer, so a drift is a compile error.
type HeirInput = Extract<VaultActionInput, { type: 'setHeirs' }>['heirs'][number];
type AssetInput = Extract<VaultActionInput, { type: 'setAssets' }>['assets'][number];
type TimingInput = Extract<VaultActionInput, { type: 'setTiming' }>['timing'];

export const ACTIONS = {
  'check-in': 'checkIn',
  'set-heirs': 'setHeirs',
  'set-guardians': 'setGuardians',
  'set-timing': 'setTiming',
  'set-assets': 'setAssets',
  'attest-death': 'attestDeath',
  'vote-recovery': 'voteRecovery',
  poke: 'poke',
  distribute: 'distribute',
  'revoke-all': 'revokeAll',
} as const satisfies Record<string, VaultActionType>;
export const ACTION_LIST = Object.keys(ACTIONS).join(', ');

const FLAGS_OF: Record<VaultActionType, readonly (keyof ActionFlags)[]> = {
  checkIn: [],
  setHeirs: ['heir'],
  setGuardians: ['guardian', 'k', 'recovery'],
  setTiming: ['timing', 'period', 'threshold', 'window'],
  setAssets: ['asset'],
  attestDeath: ['off'],
  voteRecovery: ['target', 'withdraw'],
  poke: [],
  distribute: [],
  revokeAll: [],
};

/** Own keys only: `constructor` and `__proto__` are not actions. */
function actionTypeOf(name: string): VaultActionType {
  if (!Object.hasOwn(ACTIONS, name)) {
    throw new UsageError(`Unknown action "${redactUrl(name)}". Use one of: ${ACTION_LIST}.`);
  }
  return ACTIONS[name as keyof typeof ACTIONS];
}

/** `address[:percent]`, repeated. No share anywhere: equal shares, and the rounding remainder goes to the first heir. */
export function parseHeirs(specs: readonly string[]): HeirInput[] {
  if (specs.length === 0) throw new UsageError('Give at least one --heir <address[:percent]>.');
  const parsed = specs.map((spec, i) => {
    const parts = spec.split(':');
    if (parts.length > 2) {
      throw new UsageError(`Cannot read --heir "${redactUrl(spec)}". Use <address> or <address>:<percent>.`);
    }
    return { account: toAddress(parts[0], `heir ${i + 1}`), share: parts[1] };
  });
  const withShare = parsed.filter((h) => h.share !== undefined).length;
  if (withShare === 0) {
    const each = Math.floor(10_000 / parsed.length);
    return parsed.map((h, i) => ({ account: h.account, bps: i === 0 ? 10_000 - each * (parsed.length - 1) : each }));
  }
  if (withShare !== parsed.length) throw new UsageError('Give a share to every heir, or to none for equal shares.');
  return parsed.map((h) => {
    const percent = Number(h.share);
    if (!/^\d+(\.\d+)?$/.test(h.share ?? '') || percent <= 0 || percent > 100) {
      throw new UsageError(`Cannot read the share "${redactUrl(h.share ?? '')}". Use a percent such as 70.`);
    }
    return { account: h.account, percent };
  });
}

export function parseAssets(specs: readonly string[]): AssetInput[] {
  return specs.map((spec, i) => {
    const m = /^(erc20|erc721|erc1155):([^:@]+)(?::(\d+))?(?:@(\d+))?$/.exec(spec.trim());
    if (!m) {
      throw new UsageError(
        `Cannot read --asset "${redactUrl(spec)}". Use erc20:<token>, erc721:<token>:<id>@<heir> or erc1155:<token>:<id>@<heir>, where <id> is a number and @<heir> is the heir's index, counting from 0.`,
      );
    }
    const [, kind, token, id, heir] = m;
    return {
      kind: kind as AssetInput['kind'],
      token: toAddress(token, `asset ${i + 1}`),
      ...(id === undefined ? {} : { id }),
      ...(heir === undefined ? {} : { heir: Number(heir) }),
    };
  });
}

const PRESETS: readonly string[] = ['drill', 'sixMonths', 'twelveMonths'];

function parseTiming(f: Pick<ActionFlags, 'timing' | 'period' | 'threshold' | 'window'>): TimingInput | undefined {
  const custom = f.period !== undefined || f.threshold !== undefined || f.window !== undefined;
  if (f.timing !== undefined && custom) {
    throw new UsageError('Give --timing, or --period, --threshold and --window, not both.');
  }
  if (f.timing !== undefined) {
    if (!PRESETS.includes(f.timing)) {
      throw new UsageError(`Unknown timing "${redactUrl(f.timing)}". Use drill, sixMonths or twelveMonths.`);
    }
    return f.timing as TimingInput;
  }
  if (!custom) return undefined;
  if (f.period === undefined || f.threshold === undefined || f.window === undefined) {
    throw new UsageError('A custom timing needs --period, --threshold and --window.');
  }
  return {
    period: durationArg(f.period, '--period'),
    threshold: intArg(f.threshold, '--threshold'),
    window: durationArg(f.window, '--window'),
  };
}

export function buildAction(name: string, f: ActionFlags): VaultActionInput {
  const type = actionTypeOf(name);
  const stray = givenFlags(f).filter((k) => !FLAGS_OF[type].includes(k));
  if (stray.length > 0) throw new UsageError(`--${stray[0]} does not apply to ${name}.`);
  switch (type) {
    case 'setHeirs':
      return { type, heirs: parseHeirs(f.heir ?? []) };
    case 'setGuardians':
      if (f.k === undefined) throw new UsageError('set-guardians needs --k <n>.');
      return {
        type,
        guardians: (f.guardian ?? []).map((g, i) => toAddress(g, `guardian ${i + 1}`)),
        k: intArg(f.k, '--k'),
        recoveryEnabled: f.recovery === true,
      };
    case 'setTiming': {
      const timing = parseTiming(f);
      if (timing === undefined) {
        throw new UsageError('set-timing needs --timing <preset>, or --period, --threshold and --window.');
      }
      return { type, timing };
    }
    case 'setAssets':
      return { type, assets: parseAssets(f.asset ?? []) };
    case 'attestDeath':
      return { type, on: f.off !== true };
    case 'voteRecovery':
      if (f.withdraw === true && f.target !== undefined) {
        throw new UsageError('Give --target <address> or --withdraw, not both.');
      }
      if (f.withdraw === true) return { type, target: null };
      if (f.target === undefined) throw new UsageError('vote-recovery needs --target <address>, or --withdraw.');
      return { type, target: toAddress(f.target, 'target') };
    default:
      return { type };
  }
}
