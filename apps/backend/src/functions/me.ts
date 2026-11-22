import { getAddress, isAddress } from 'viem';
import type { Deps } from '../deps';
import { invalid, json, route } from '../http';
import { getCursor } from '../store/meta';
import { vaultsOfAddress } from '../store/vaults';

/** GET /me?address= (spec §9.6): public index data, so any origin may read it. */
export const me = route<Deps>({ method: 'GET', cors: 'public' }, async (req, d) => {
  const raw = new URL(req.url).searchParams.get('address') ?? '';
  if (!isAddress(raw, { strict: false })) throw invalid('address must be an address.');
  const address = getAddress(raw);
  const block = (await getCursor(d.sql)) ?? 0n;
  return json({ address, block, vaults: await vaultsOfAddress(d.sql, address) }, 200, {
    'cache-control': 'public, max-age=15',
  });
});
