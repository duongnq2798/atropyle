import type { Address } from 'viem';
import type { VaultView } from '../../src/chain/port';
import { sha256Hex, unsubToken } from '../../src/crypto';
import type { Sql } from '../../src/db/sql';
import type { Subscriber } from '../../src/store/subscriptions';
import { insertCreated, insertEvents, saveView } from '../../src/store/vaults';
import type { Lang, Role } from '../../src/types';
import { txh, vaultEvent } from './fixtures';

/** An already confirmed subscription, as if the double opt-in had happened. */
export async function activeSubscriber(
  sql: Sql,
  o: { email: string; vault: Address; role: Role; lang?: Lang; tokenSecret?: string },
): Promise<Subscriber> {
  const lang = o.lang ?? 'en';
  const [row] = await sql.query<{ id: string }>(
    `insert into public.subscriptions (email, vault, role, lang, status, confirm_hash, confirmed_at)
     values ($1::text, $2::text, $3::text, $4::text, 'active', $5::text, now())
     returning id::text as id`,
    [o.email, o.vault.toLowerCase(), o.role, lang, await sha256Hex(`seed:${o.email}:${o.role}:${o.vault}`)],
  );
  const hash = await sha256Hex(await unsubToken(o.tokenSecret ?? 't'.repeat(32), row.id));
  await sql.query('update public.subscriptions set unsub_hash = $2::text where id = $1::bigint', [row.id, hash]);
  return { id: row.id, email: o.email, lang, role: o.role, vault: o.vault };
}

let seedTx = 0x5eed00;

/**
 * A vault as the indexer would have stored it: created at createdBlock (default 150), its Alive event at aliveBlock
 * (default createdBlock; null: none), then the view. The Alive event is left unnotified, like a freshly indexed one.
 */
export async function seedVault(
  sql: Sql,
  v: VaultView,
  o: { createdBlock?: bigint; aliveBlock?: bigint | null } = {},
): Promise<void> {
  const createdBlock = o.createdBlock ?? 150n;
  const aliveBlock = o.aliveBlock === undefined ? createdBlock : o.aliveBlock;
  const iso = '2026-11-23T12:00:00.000Z';
  await sql.begin(async (tx) => {
    await insertCreated(
      tx,
      { vault: v.vault, owner: v.owner, drill: v.drill, blockNumber: createdBlock, transactionHash: txh(seedTx++) },
      iso,
    );
    if (aliveBlock !== null) {
      const alive = vaultEvent(
        'Alive',
        { at: v.lastAlive },
        { address: v.vault, blockNumber: aliveBlock, transactionHash: txh(seedTx++) },
      );
      await insertEvents(tx, [{ event: alive, at: v.lastAlive }]);
    }
    await saveView(tx, v, iso);
  });
}
