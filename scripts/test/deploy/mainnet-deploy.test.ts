import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addressArg,
  childEnv,
  controlledNamesInEnvFile,
  existingProcessor,
  exportLines,
  mergeRoles,
  parseExports,
  type Roles,
  readProgress,
  STAGES,
  stageDone,
  writeProgress,
} from '../../lib/mainnet-deploy';

const DEPLOYER = '0x7a0d49C1c18eBa36023F64d795aE688B61C41996';
const TREASURY = '0x1f09DAeFA827f02CBb40967cc91b259763760761';
const HEIR = '0x536adD8F30f03b69f6fbF29d425A816A0dC50106';
const ROLES: Roles = { deployer: DEPLOYER, treasury: TREASURY, smokeHeir: HEIR };

describe('parseExports', () => {
  it('reads the named export lines from forge output, checksummed', () => {
    const out = [
      'Script ran successfully.',
      '== Logs ==',
      '  createCPU returned 0x0000000000000000000000000000000000000001',
      `  export ATRO_CPU=${HEIR.toLowerCase()}`,
      '  export KOFN_ID=4\r',
      '  export GE4_ID=5',
      '  export SOMETHING_ELSE=1',
    ].join('\n');
    expect(parseExports(out, ['ATRO_CPU', 'KOFN_ID'])).toEqual({ ATRO_CPU: HEIR, KOFN_ID: '4' });
    expect(parseExports(out, ['GE4_ID'])).toEqual({ GE4_ID: '5' });
    expect(parseExports(out, ['POLICY_ID'])).toEqual({});
  });

  it('reads every value any stage produces', () => {
    for (const s of STAGES)
      for (const name of s.produces) {
        const value = /ID$/.test(name) ? '7' : HEIR;
        expect(parseExports(`  export ${name}=${value}`, [name])).toEqual({ [name]: value });
      }
  });

  it('refuses a value of the wrong kind', () => {
    expect(() => parseExports('export ATRO_CPU=0x1234', ['ATRO_CPU'])).toThrow(/not an address/);
    expect(() => parseExports('export POLICY_ID=0x12', ['POLICY_ID'])).toThrow(/not a decimal id/);
  });
});

it('existingProcessor reads the processor from the stage 01 refusal', () => {
  const msg =
    `Error: script failed: an Atropyle processor by DEPLOYER already exists: ${HEIR} (export ATRO_CPU=` +
    `${HEIR} and continue with stage 2; only if it is unusable, export REPLACE_PROCESSOR=${HEIR} to abandon it)`;
  expect(existingProcessor(msg)).toBe(HEIR);
  expect(existingProcessor('Error: script failed: not enough BEM for deployFee')).toBeNull();
});

describe('childEnv', () => {
  it('drops stale stage values and every ETH_*, FOUNDRY_* and DAPP_* override, then sets the saved ones', () => {
    const env = childEnv(
      {
        PATH: '/bin',
        ATRO_CPU: '0xstale',
        ATRO_FACTORY: '0xstale',
        TREASURY: '0xstale',
        REPLACE_PROCESSOR: '0xstale',
        eth_rpc_url: 'http://elsewhere',
        ETH_FROM: '0xstale',
        FOUNDRY_PROFILE: 'other',
        DAPP_OPTIMIZER_RUNS: '1',
        XLAYER_FORK_RPC: 'http://stale',
        UNSET: undefined,
      },
      ROLES,
      { ATRO_CPU: HEIR, KOFN_ID: '4' },
      { XLAYER_FORK_RPC: 'https://rpc.xlayer.tech' },
    );
    expect(env).toEqual({
      PATH: '/bin',
      DEPLOYER,
      TREASURY,
      SMOKE_HEIR: HEIR,
      ATRO_CPU: HEIR,
      KOFN_ID: '4',
      XLAYER_FORK_RPC: 'https://rpc.xlayer.tech',
    });
  });
});

it('controlledNamesInEnvFile names every line of contracts/.env that forge would feed into a stage', () => {
  const text = [
    '# OKLink',
    'OKLINK_API_KEY=abc',
    'export REPLACE_PROCESSOR=0x1',
    '  KOFN_ID = 4',
    'ETH_PASSWORD=/tmp/pw',
    'DAPP_OPTIMIZER_RUNS=1',
    'foundry_profile=ci',
    'REPLACE_PROCESSOR=0x2',
    'NOT_A_LINE',
  ].join('\r\n');
  expect(controlledNamesInEnvFile(text)).toEqual([
    'REPLACE_PROCESSOR',
    'KOFN_ID',
    'ETH_PASSWORD',
    'DAPP_OPTIMIZER_RUNS',
    'foundry_profile',
  ]);
  expect(controlledNamesInEnvFile('OKLINK_API_KEY=abc\n')).toEqual([]);
});

describe('mergeRoles', () => {
  it('needs a deployer and a treasury on a first run, and the heir defaults to the treasury', () => {
    expect(mergeRoles({ treasury: TREASURY }, null)).toMatch(/--deployer/);
    expect(mergeRoles({ deployer: DEPLOYER }, null)).toMatch(/--treasury/);
    expect(mergeRoles({ deployer: DEPLOYER, treasury: TREASURY }, null)).toEqual({ ...ROLES, smokeHeir: TREASURY });
    expect(mergeRoles({ deployer: DEPLOYER, treasury: DEPLOYER }, null)).toMatch(/must differ from DEPLOYER/);
  });

  it('keeps the roles of an earlier run and refuses different ones', () => {
    expect(mergeRoles({}, ROLES)).toEqual(ROLES);
    expect(mergeRoles({ deployer: DEPLOYER }, ROLES)).toEqual(ROLES);
    expect(mergeRoles({ treasury: HEIR }, ROLES)).toMatch(/--treasury .* differs from the earlier run/);
    expect(mergeRoles({ smokeHeir: TREASURY }, ROLES)).toMatch(/--smoke-heir/);
  });
});

describe('progress file', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('round-trips, and an older file without verified reads as none verified', () => {
    dir = mkdtempSync(join(tmpdir(), 'atro-deploy-'));
    const file = join(dir, 'deep', 'progress.json');
    expect(readProgress(file)).toBeNull();
    writeProgress(file, {
      chainId: 196,
      roles: ROLES,
      values: { ATRO_CPU: HEIR },
      txs: { '01': ['0xab'] },
      verified: [],
    });
    expect(readProgress(file)).toEqual({
      chainId: 196,
      roles: ROLES,
      values: { ATRO_CPU: HEIR },
      txs: { '01': ['0xab'] },
      verified: [],
    });
    writeProgress(file, { chainId: 196, roles: ROLES, values: {}, txs: {} } as never);
    expect(readProgress(file)?.verified).toEqual([]);
  });
});

it('a stage is done only when every value it produces is known', () => {
  const s02 = STAGES[1];
  expect(stageDone(s02, { KOFN_ID: '4' })).toBe(false);
  expect(stageDone(s02, { KOFN_ID: '4', GE4_ID: '5' })).toBe(true);
  expect(STAGES.map((s) => s.id)).toEqual(['01', '02', '03', '04', '05']);
});

it('exportLines lists the roles, then the known stage values in stage order', () => {
  expect(exportLines(ROLES, { POLICY_ID: '6', ATRO_CPU: HEIR })).toEqual([
    `export DEPLOYER=${DEPLOYER}`,
    `export TREASURY=${TREASURY}`,
    `export SMOKE_HEIR=${HEIR}`,
    `export ATRO_CPU=${HEIR}`,
    'export POLICY_ID=6',
  ]);
});

it('addressArg checksums an address and throws on anything else', () => {
  expect(addressArg('deployer', DEPLOYER.toLowerCase())).toBe(DEPLOYER);
  expect(addressArg('deployer', undefined)).toBeUndefined();
  expect(() => addressArg('treasury', '0x12')).toThrow('--treasury is not an address: 0x12');
});
