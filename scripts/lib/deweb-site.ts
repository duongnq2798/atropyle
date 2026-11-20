// The DeWEB site identity, deployments/deweb.json (Plan 4, decision 15). Written by npm run deweb:site, read-only.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { type Address, getAddress, isAddress } from 'viem';
import { DEWEB } from './deweb';

export interface DewebSite {
  chainId: number;
  registry: Address;
  binding: Address;
  opener: Address;
  cpu: Address;
  cpuIndex: number;
  tokenId: string;
  container: Address;
  name: string;
  gatewayUrl: string;
}

/** Canonical name: zone 2 is X Layer (gateway config.js). A bare name like "atropyle" cannot be bound (Plan 4, decision 12). */
export function siteName(tokenId: bigint | number | string, cpuIndex: number): string {
  return `${BigInt(tokenId)}.2.${cpuIndex}.tape`;
}

export function gatewayUrl(tokenId: bigint | number | string, cpuIndex: number): string {
  return `https://${BigInt(tokenId)}-2-${cpuIndex}.tapekit.org/`;
}

const addr = (a: string) => getAddress(a.toLowerCase());

export function makeSite(o: { cpu: Address; cpuIndex: number; tokenId: bigint; container: Address }): DewebSite {
  return {
    chainId: DEWEB.chainId,
    registry: DEWEB.registry,
    binding: DEWEB.binding,
    opener: DEWEB.opener,
    cpu: addr(o.cpu),
    cpuIndex: o.cpuIndex,
    tokenId: o.tokenId.toString(),
    container: addr(o.container),
    name: siteName(o.tokenId, o.cpuIndex),
    gatewayUrl: gatewayUrl(o.tokenId, o.cpuIndex),
  };
}

export function parseSite(json: unknown): DewebSite {
  if (!json || typeof json !== 'object') throw new Error('deweb.json must be an object');
  const o = json as Record<string, unknown>;
  for (const k of ['registry', 'binding', 'opener', 'cpu', 'container'] as const) {
    const v = o[k];
    if (typeof v !== 'string' || !isAddress(v, { strict: false })) throw new Error(`${k} is not an address`);
  }
  if (o.chainId !== DEWEB.chainId) throw new Error(`chainId must be ${DEWEB.chainId}`);
  for (const k of ['registry', 'binding', 'opener'] as const) {
    if (addr(o[k] as string) !== DEWEB[k]) throw new Error(`${k} must be ${DEWEB[k]}`);
  }
  if (typeof o.cpuIndex !== 'number' || !Number.isInteger(o.cpuIndex) || o.cpuIndex < 0) {
    throw new Error('cpuIndex must be a non-negative integer');
  }
  if (typeof o.tokenId !== 'string' || !/^[1-9]\d*$/.test(o.tokenId)) {
    throw new Error('tokenId must be a decimal string');
  }
  const s = makeSite({
    cpu: o.cpu as Address,
    cpuIndex: o.cpuIndex,
    tokenId: BigInt(o.tokenId),
    container: o.container as Address,
  });
  if (o.name !== s.name) throw new Error(`name must be ${s.name}`);
  if (o.gatewayUrl !== s.gatewayUrl) throw new Error(`gatewayUrl must be ${s.gatewayUrl}`);
  return s;
}

export function readSite(file: string): DewebSite | null {
  if (!existsSync(file)) return null;
  return parseSite(JSON.parse(readFileSync(file, 'utf8')));
}

export function writeSite(file: string, s: DewebSite): void {
  writeFileSync(file, `${JSON.stringify(parseSite(s), null, 2)}\n`);
}
