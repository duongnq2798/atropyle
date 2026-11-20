import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAddress } from 'viem';
import { afterAll, expect, test } from 'vitest';
import { DEWEB } from '../../lib/deweb';
import { gatewayUrl, makeSite, parseSite, readSite, siteName, writeSite } from '../../lib/deweb-site';

const LIVE_CPU = getAddress('0x632910a79eee7fa99e99695510aa95ddee6ef771');
const LIVE_CONTAINER = getAddress('0x97abe83c61003674451c35441c02cc3d7ad2c1e3');

const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

test('siteName and gatewayUrl follow the gateway naming', () => {
  expect(siteName(1n, 396)).toBe('1.2.396.tape');
  expect(gatewayUrl(1n, 396)).toBe('https://1-2-396.tapekit.org/');
  expect(siteName('4', 412)).toBe('4.2.412.tape');
  expect(gatewayUrl(4, 412)).toBe('https://4-2-412.tapekit.org/');
});

test('deployments/deweb.json round-trips and is validated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atropyle-deweb-'));
  temps.push(dir);
  const file = join(dir, 'deweb.json');
  expect(readSite(file)).toBeNull();
  const s = makeSite({ cpu: LIVE_CPU, cpuIndex: 396, tokenId: 1n, container: LIVE_CONTAINER });
  expect(s).toEqual({
    chainId: 196,
    registry: DEWEB.registry,
    binding: DEWEB.binding,
    opener: DEWEB.opener,
    cpu: LIVE_CPU,
    cpuIndex: 396,
    tokenId: '1',
    container: LIVE_CONTAINER,
    name: '1.2.396.tape',
    gatewayUrl: 'https://1-2-396.tapekit.org/',
  });
  writeSite(file, s);
  expect(readSite(file)).toEqual(s);
  expect(() => parseSite({ ...s, name: 'atropyle.tape' })).toThrow('name must be 1.2.396.tape');
  expect(() => parseSite({ ...s, container: '0x1234' })).toThrow('container is not an address');
  expect(() => parseSite({ ...s, chainId: 56 })).toThrow('chainId must be 196');
  expect(() => parseSite({ ...s, tokenId: 1 })).toThrow('tokenId must be a decimal string');
  expect(() => parseSite({ ...s, registry: LIVE_CPU })).toThrow(`registry must be ${DEWEB.registry}`);
  expect(() => parseSite({ ...s, cpuIndex: -1 })).toThrow('cpuIndex must be a non-negative integer');
  expect(() => parseSite({ ...s, gatewayUrl: 'https://evil.example/' })).toThrow(
    'gatewayUrl must be https://1-2-396.tapekit.org/',
  );
  expect(() => parseSite(null)).toThrow('deweb.json must be an object');
});
