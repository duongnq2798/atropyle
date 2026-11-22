import { toAddress } from '@atropyle/sdk';
import type { Address } from 'viem';

export type Route =
  | { name: 'home' }
  | { name: 'create'; drill: boolean }
  | { name: 'vault'; vault: Address }
  | { name: 'verify'; vault: Address }
  | { name: 'proof' }
  | { name: 'sign' }
  | { name: 'status' }
  | { name: 'developers' }
  | { name: 'badAddress'; input: string }
  | { name: 'notFound'; path: string };

function vaultRoute(raw: string, verify: boolean): Route {
  try {
    const vault = toAddress(decodeURIComponent(raw));
    return verify ? { name: 'verify', vault } : { name: 'vault', vault };
  } catch {
    return { name: 'badAddress', input: raw.slice(0, 64) };
  }
}

/** `#/sign?p=…`: the sign page reads the payload itself through `atro.handoff.parse(location.hash)`. */
export function parseRoute(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  const path = (q < 0 ? raw : raw.slice(0, q)) || '/';
  const query = new URLSearchParams(q < 0 ? '' : raw.slice(q + 1));
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  const [first, second, third] = parts;
  if (parts.length === 1) {
    if (first === 'create') return { name: 'create', drill: query.get('drill') === '1' };
    if (first === 'proof') return { name: 'proof' };
    if (first === 'sign') return { name: 'sign' };
    if (first === 'status') return { name: 'status' };
    if (first === 'developers') return { name: 'developers' };
  }
  if (first === 'v' && parts.length === 2) return vaultRoute(second, false);
  if (first === 'v' && parts.length === 3 && third === 'verify') return vaultRoute(second, true);
  return { name: 'notFound', path: path.startsWith('/') ? path : `/${path}` };
}

export function href(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'create':
      return r.drill ? '#/create?drill=1' : '#/create';
    case 'vault':
      return `#/v/${r.vault}`;
    case 'verify':
      return `#/v/${r.vault}/verify`;
    case 'badAddress':
      return `#/v/${encodeURIComponent(r.input)}`;
    case 'notFound':
      return `#${r.path}`;
    default:
      return `#/${r.name}`;
  }
}
