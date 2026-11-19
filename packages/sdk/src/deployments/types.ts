import type { Address, Hex } from 'viem';
import { toAddress } from '../address';
import { AtropyleError } from '../errors';
import { toJson } from '../json';

export interface DeployedCircuits {
  kofn5: bigint;
  ge4: bigint;
  netlistKeccak: { kofn5: Hex; ge4: Hex; policy: Hex };
}

export interface TapeoutInfo {
  factory: Address;
  beacon: Address;
  beaconSlot: Hex;
  name: string;
  symbol: string;
}

export interface Deployment {
  name: string;
  chainId: number;
  /** Ordinary reads: one fallback transport over these URLs. */
  rpcUrls: string[];
  /** Verification reads: one group per independent operator (spec §5.4). */
  quorumRpcUrls: string[][];
  explorerUrl: string | null;
  factory: Address;
  factoryBlock: bigint;
  vaultImpl: Address;
  vaultImplCodehash: Hex;
  cpu: Address;
  policyId: bigint;
  treasury: Address;
  feeTokens: Address[];
  /** null on the devnet (mock CPU without netlists). */
  circuits: DeployedCircuits | null;
  /** null on the devnet (no TapeOut factory). */
  tapeout: TapeoutInfo | null;
  builderCode: string | null;
  webUrl: string | null;
  /** Largest eth_getLogs range the RPCs accept. */
  logsBlockRange: number;
  /** Devnet only: mock NFT contracts minted to the anvil accounts. */
  mocks?: { nft: Address; multi: Address };
}

type Obj = Record<string, unknown>;

function fail(path: string, why: string): never {
  throw new AtropyleError('DEPLOYMENT_INVALID', { message: `${path}: ${why}`, details: { path } });
}

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'expected an object');
  return v as Obj;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(path, 'expected a non-empty string');
  return v;
}

function int(v: unknown, path: string, min: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min) fail(path, `expected an integer ≥ ${min}`);
  return v;
}

function big(v: unknown, path: string): bigint {
  if (typeof v === 'bigint' && v >= 0n) return v;
  if (typeof v !== 'string' || !/^\d+$/.test(v)) fail(path, 'expected a decimal string');
  return BigInt(v);
}

function addr(v: unknown, path: string): Address {
  try {
    return toAddress(v, path);
  } catch {
    fail(path, 'expected an address');
  }
}

function hex32(v: unknown, path: string): Hex {
  if (typeof v !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(v)) fail(path, 'expected 32 bytes of hex');
  return v.toLowerCase() as Hex;
}

function list<T>(v: unknown, path: string, each: (x: unknown, p: string) => T, min = 1): T[] {
  if (!Array.isArray(v) || v.length < min) fail(path, `expected an array with at least ${min} item(s)`);
  return v.map((x, i) => each(x, `${path}[${i}]`));
}

function nullable<T>(v: unknown, path: string, f: (x: unknown, p: string) => T): T | null {
  return v === null || v === undefined ? null : f(v, path);
}

export function parseDeployment(input: unknown): Deployment {
  const o = obj(input, 'deployment');
  const d: Deployment = {
    name: str(o.name, 'name'),
    chainId: int(o.chainId, 'chainId', 1),
    rpcUrls: list(o.rpcUrls, 'rpcUrls', str),
    quorumRpcUrls: list(o.quorumRpcUrls, 'quorumRpcUrls', (g, p) => list(g, p, str)),
    explorerUrl: nullable(o.explorerUrl, 'explorerUrl', str),
    factory: addr(o.factory, 'factory'),
    factoryBlock: big(o.factoryBlock, 'factoryBlock'),
    vaultImpl: addr(o.vaultImpl, 'vaultImpl'),
    vaultImplCodehash: hex32(o.vaultImplCodehash, 'vaultImplCodehash'),
    cpu: addr(o.cpu, 'cpu'),
    policyId: big(o.policyId, 'policyId'),
    treasury: addr(o.treasury, 'treasury'),
    feeTokens: list(o.feeTokens, 'feeTokens', addr),
    circuits: nullable(o.circuits, 'circuits', (c, p) => {
      const x = obj(c, p);
      const h = obj(x.netlistKeccak, `${p}.netlistKeccak`);
      return {
        kofn5: big(x.kofn5, `${p}.kofn5`),
        ge4: big(x.ge4, `${p}.ge4`),
        netlistKeccak: {
          kofn5: hex32(h.kofn5, `${p}.netlistKeccak.kofn5`),
          ge4: hex32(h.ge4, `${p}.netlistKeccak.ge4`),
          policy: hex32(h.policy, `${p}.netlistKeccak.policy`),
        },
      };
    }),
    tapeout: nullable(o.tapeout, 'tapeout', (t, p) => {
      const x = obj(t, p);
      return {
        factory: addr(x.factory, `${p}.factory`),
        beacon: addr(x.beacon, `${p}.beacon`),
        beaconSlot: hex32(x.beaconSlot, `${p}.beaconSlot`),
        name: str(x.name, `${p}.name`),
        symbol: str(x.symbol, `${p}.symbol`),
      };
    }),
    builderCode: nullable(o.builderCode, 'builderCode', str),
    webUrl: nullable(o.webUrl, 'webUrl', str),
    logsBlockRange: int(o.logsBlockRange, 'logsBlockRange', 1),
  };
  if (o.mocks !== undefined && o.mocks !== null) {
    const m = obj(o.mocks, 'mocks');
    d.mocks = { nft: addr(m.nft, 'mocks.nft'), multi: addr(m.multi, 'mocks.multi') };
  }
  return d;
}

export function deploymentToJson(d: Deployment): Record<string, unknown> {
  return toJson(d) as Record<string, unknown>;
}
