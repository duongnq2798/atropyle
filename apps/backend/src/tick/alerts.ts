import { isoAt } from '../clock';
import type { Deps } from '../deps';
import { opsAlert } from '../ops';
import { getMeta, setMeta } from '../store/meta';
import { staleViewsSince } from '../store/vaults';
import type { IndexerMeta } from './indexer';
import type { NoticeResult } from './notices';

/** The indexer may stay short of head − margin this long before ops hear of it. */
export const INDEXER_LAG_MS = 15 * 60_000;
/** A vault view may stay stale this long before ops hear of it. */
export const STALE_VIEW_MS = 30 * 60_000;
/** Ticks whose notices failed and sent nothing, for this long, mean mail is broken. */
export const MAIL_FAILING_MS = 10 * 60_000;

/**
 * 'indexer-lag' (I3): fires when the cursor has not reached head − margin for INDEXER_LAG_MS (a scan that keeps
 * failing, a head that cannot be read) or when a vault view has been stale for STALE_VIEW_MS; resolves when both
 * clear. Event emails older than 24 h are dropped, so a stall must not go unnoticed. Runs every tick, even when the
 * head could not be read.
 */
export async function checkIndexerLag(d: Deps): Promise<void> {
  const now = d.clock.now();
  const idx = await getMeta<IndexerMeta>(d.sql, 'indexer');
  const caughtUpAt = idx?.value.caughtUpAt ?? null;
  const behind = caughtUpAt !== null && now - Date.parse(caughtUpAt) >= INDEXER_LAG_MS;
  const stale = await staleViewsSince(d.sql, isoAt(now - STALE_VIEW_MS));
  const parts: string[] = [];
  if (behind && idx) {
    parts.push(
      `The indexer has not reached head − ${d.config.headMargin} since ${caughtUpAt}: indexed block ${idx.value.block}, head ${idx.value.head} when last read.`,
    );
  }
  if (stale.oldest) {
    parts.push(
      `${stale.count} vault view(s) stale for ${STALE_VIEW_MS / 60_000} minutes or more; the oldest is ${stale.oldest.vault}, stale since ${stale.oldest.since}. Their event emails wait and are dropped after 24 h.`,
    );
  }
  const firing = parts.length > 0;
  await opsAlert(
    d,
    'indexer-lag',
    firing,
    firing ? parts.join('\n') : 'The indexer has caught up and every vault view is current.',
  );
}

interface MailMeta {
  failingSince: string | null;
}

/**
 * 'mail-failing' (I3): fires when every tick for MAIL_FAILING_MS had at least one failed delivery and none sent;
 * resolves on the next tick with a sent email or without failures. Event emails older than 24 h are dropped, so a
 * broken Resend key or domain must not go unnoticed. If Resend itself is broken, this alert's own email fails too:
 * it is then logged and retried each tick.
 */
export async function checkMail(d: Deps, n: NoticeResult): Promise<void> {
  const now = d.clock.now();
  const prev = (await getMeta<MailMeta>(d.sql, 'mail'))?.value.failingSince ?? null;
  const since = n.failed > 0 && n.sent === 0 ? (prev ?? isoAt(now)) : null;
  if (since !== prev) await setMeta(d.sql, 'mail', { failingSince: since }, isoAt(now));
  const firing = since !== null && now - Date.parse(since) >= MAIL_FAILING_MS;
  await opsAlert(
    d,
    'mail-failing',
    firing,
    firing
      ? `Every email attempt has failed since ${since} (this tick: ${n.failed} failed, none sent). Check RESEND_API_KEY and the sending domain in Resend.`
      : 'Emails are going out again.',
  );
}
