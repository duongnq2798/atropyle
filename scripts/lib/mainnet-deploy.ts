// Pure helpers for scripts/deploy-mainnet.ts: the stage table, the child environment, the parser for the
// `export NAME=value` lines the forge scripts print, and the progress file. Nothing here signs or reads a key.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type Address, getAddress, isAddress } from 'viem';

/** The values the five stages hand to each other (contracts/README.md, "Triển khai mainnet"). */
export const STAGE_VARS = [
  'ATRO_CPU',
  'KOFN_ID',
  'GE4_ID',
  'POLICY_ID',
  'VAULT_IMPL',
  'ATRO_FACTORY',
  'SMOKE_VAULT',
] as const;
export type StageVar = (typeof STAGE_VARS)[number];
const ADDRESS_VARS: ReadonlySet<StageVar> = new Set(['ATRO_CPU', 'VAULT_IMPL', 'ATRO_FACTORY', 'SMOKE_VAULT']);

export interface Stage {
  id: '01' | '02' | '03' | '04' | '05';
  script: string;
  /** Stage values this stage reads, beyond DEPLOYER / TREASURY / SMOKE_HEIR. */
  needs: readonly StageVar[];
  produces: readonly StageVar[];
}

export const STAGES: readonly Stage[] = [
  { id: '01', script: '01_CreateProcessor', needs: [], produces: ['ATRO_CPU'] },
  { id: '02', script: '02_TapeOutSubs', needs: ['ATRO_CPU'], produces: ['KOFN_ID', 'GE4_ID'] },
  { id: '03', script: '03_TapeOutPolicy', needs: ['ATRO_CPU', 'KOFN_ID', 'GE4_ID'], produces: ['POLICY_ID'] },
  {
    id: '04',
    script: '04_DeployAtropyle',
    needs: ['ATRO_CPU', 'KOFN_ID', 'GE4_ID', 'POLICY_ID'],
    produces: ['VAULT_IMPL', 'ATRO_FACTORY'],
  },
  { id: '05', script: '05_SmokeDrill', needs: ['ATRO_FACTORY'], produces: ['SMOKE_VAULT'] },
];

export interface Roles {
  deployer: Address;
  treasury: Address;
  smokeHeir: Address;
}

export interface Progress {
  chainId: number;
  roles: Roles;
  values: Partial<Record<StageVar, string>>;
  /** Transaction hashes per stage, read from forge's broadcast record. */
  txs: Partial<Record<Stage['id'], string[]>>;
  /** Stages whose values were read back from the chain. A stage with values but not here is never sent again. */
  verified: Stage['id'][];
  /**
   * Set before forge starts a stage and cleared once all its values are saved. A pending stage whose deployer nonce
   * has moved since is never sent again by this script: forge may have sent part of it before it stopped.
   */
  pending?: { stage: Stage['id']; nonce: number; startedAt: number };
}

export function stageDone(stage: Stage, values: Progress['values']): boolean {
  return stage.produces.every((v) => values[v] !== undefined);
}

const DROPPED = new Set<string>([
  ...STAGE_VARS,
  'DEPLOYER',
  'TREASURY',
  'SMOKE_HEIR',
  'REPLACE_PROCESSOR',
  'BEM_HOLDER',
  'RPC',
  'XLAYER_FORK_RPC',
]);

/** A name forge must only ever get from this script: stage values, roles, and Foundry's own overrides. */
export function isControlledName(name: string): boolean {
  const u = name.toUpperCase();
  return DROPPED.has(u) || u.startsWith('ETH_') || u.startsWith('FOUNDRY_') || u.startsWith('DAPP_');
}

/**
 * The environment for forge. It starts from the parent's, then drops every controlled name (stage values, roles,
 * rehearsal leftovers, ETH_*, FOUNDRY_* and DAPP_* overrides), so a stale shell can never feed a value into a
 * mainnet stage: the stage reads exactly what the progress file holds.
 */
export function childEnv(
  parent: NodeJS.ProcessEnv,
  roles: Roles,
  values: Progress['values'],
  extra: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(parent)) {
    if (v === undefined || isControlledName(k)) continue;
    env[k] = v;
  }
  env.DEPLOYER = roles.deployer;
  env.TREASURY = roles.treasury;
  env.SMOKE_HEIR = roles.smokeHeir;
  for (const name of STAGE_VARS) {
    const v = values[name];
    if (v !== undefined) env[name] = v;
  }
  return { ...env, ...extra };
}

/** Reads `export NAME=value` lines (from console2.log in the stage scripts) for the given names. */
export function parseExports(output: string, names: readonly StageVar[]): Partial<Record<StageVar, string>> {
  const found: Partial<Record<StageVar, string>> = {};
  for (const line of output.split(/\r?\n/)) {
    const m = /^\s*export ([A-Z][A-Z0-9_]*)=(\S+)\s*$/.exec(line);
    if (!m) continue;
    const name = m[1] as StageVar;
    if (!names.includes(name)) continue;
    const value = m[2];
    if (ADDRESS_VARS.has(name)) {
      if (!isAddress(value, { strict: false })) throw new Error(`${name} is not an address: ${value}`);
      found[name] = getAddress(value);
    } else {
      if (!/^\d+$/.test(value)) throw new Error(`${name} is not a decimal id: ${value}`);
      found[name] = value;
    }
  }
  return found;
}

/**
 * Forge loads contracts/.env itself and fills every variable the environment leaves unset, so a controlled name
 * there (REPLACE_PROCESSOR, an id, ETH_PASSWORD…) would reach a stage. Returns those names; reads names only.
 */
export function controlledNamesInEnvFile(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m && isControlledName(m[1]) && !names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

export type FoundrySource = { use: 'path' } | { use: 'dir'; dir: string } | { error: string };

/**
 * Where forge and cast come from. If they are not on PATH, the default foundryup folder (~/.foundry/bin) is used
 * when it holds both: PowerShell on Windows often lacks that folder when Foundry was installed from Git Bash.
 */
export function resolveFoundry(
  onPath: boolean,
  home: string,
  platform: NodeJS.Platform,
  exists: (path: string) => boolean,
): FoundrySource {
  if (onPath) return { use: 'path' };
  const dir = join(home, '.foundry', 'bin');
  const exe = platform === 'win32' ? '.exe' : '';
  if (exists(join(dir, `forge${exe}`)) && exists(join(dir, `cast${exe}`))) return { use: 'dir', dir };
  return {
    error:
      `forge and cast were found neither on PATH nor in ${dir}. Install Foundry 1.9.0 with foundryup, or add ` +
      `its bin folder to PATH (PowerShell: $env:Path += ";$env:USERPROFILE\\.foundry\\bin").`,
  };
}

/** Script 01's refusal when DEPLOYER already created an Atropyle processor: returns that processor. */
export function existingProcessor(output: string): Address | null {
  const m = /export ATRO_CPU=(0x[0-9a-fA-F]{40}) and continue with stage 2/.exec(output);
  return m ? getAddress(m[1]) : null;
}

export function exportLines(roles: Roles, values: Progress['values']): string[] {
  const lines = [`export DEPLOYER=${roles.deployer}`, `export TREASURY=${roles.treasury}`];
  lines.push(`export SMOKE_HEIR=${roles.smokeHeir}`);
  for (const name of STAGE_VARS) {
    const v = values[name];
    if (v !== undefined) lines.push(`export ${name}=${v}`);
  }
  return lines;
}

export function readProgress(file: string): Progress | null {
  if (!existsSync(file)) return null;
  const p = JSON.parse(readFileSync(file, 'utf8')) as Progress;
  if (typeof p.chainId !== 'number' || !p.roles || !p.values) throw new Error(`${file} is not a progress file`);
  return { ...p, txs: p.txs ?? {}, verified: p.verified ?? [] };
}

/** Writes through a temporary file, so a crash mid-write never leaves half a progress file. */
export function writeProgress(file: string, p: Progress): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(p, null, 2)}\n`);
  renameSync(tmp, file);
}

/**
 * Checks the roles given on the command line against those of an earlier run. A role may be left out on a
 * resume; a different one is refused, since stages 01-05 bind DEPLOYER and stage 04 binds TREASURY for good.
 */
export function mergeRoles(given: Partial<Roles>, saved: Roles | null): Roles | string {
  if (saved) {
    for (const key of ['deployer', 'treasury', 'smokeHeir'] as const) {
      const g = given[key];
      if (g !== undefined && g !== saved[key])
        return `--${key === 'smokeHeir' ? 'smoke-heir' : key} ${g} differs from the earlier run (${saved[key]})`;
    }
    return saved;
  }
  if (!given.deployer) return '--deployer is required';
  if (!given.treasury) return '--treasury is required';
  const smokeHeir = given.smokeHeir ?? given.treasury;
  if (smokeHeir === given.deployer)
    return 'the smoke vault heir must differ from DEPLOYER: give --smoke-heir, or a --treasury other than --deployer';
  return { deployer: given.deployer, treasury: given.treasury, smokeHeir };
}

/** Parses an address argument into its checksummed form; throws on anything else. */
export function addressArg(name: string, value: string | undefined): Address | undefined {
  if (value === undefined) return undefined;
  if (!isAddress(value, { strict: false })) throw new Error(`--${name} is not an address: ${value}`);
  return getAddress(value);
}
