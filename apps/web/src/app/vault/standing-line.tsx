'use client';

import { useChainNow } from '@/chain/time';
import type { RegisteredVault } from '@/chain/types';
import type { VaultView } from '@/flows/impl/vault-view';
import { useLang, useT } from '@/i18n/provider';
import { messages } from '@/messages/standing.messages';
import { standingRole, standingSentence } from './standing';

/** The header's first sentence, in the product's voice (§18.2 principle 7); nothing for an heir or a guardian. */
export function StandingLine({ loaded, view }: { loaded: RegisteredVault; view: VaultView }) {
  const t = useT(messages);
  const { lang } = useLang();
  const s = loaded.snap.status;
  const now =
    useChainNow({ blockTimestamp: s.blockTimestamp, fetchedAtMs: loaded.fetchedAtMs }, 30_000) ?? s.blockTimestamp;
  const sentence = standingSentence({
    role: standingRole(view.roles),
    status: s,
    chainNow: now,
    lang,
    drill: view.drill,
  });
  if (!sentence) return null;
  return (
    <p
      data-testid="vault-standing"
      data-key={sentence.key}
      className="voice-proclaim max-w-3xl text-balance text-lead text-ink"
    >
      {t(sentence.key, sentence.params)}
    </p>
  );
}
