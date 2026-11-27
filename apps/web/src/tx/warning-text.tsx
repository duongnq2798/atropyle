'use client';

import type { Warning } from '@atropyle/sdk';
import { useLang, useT } from '@/i18n/provider';
import { durationWords } from '@/lib/duration';
import { messages } from '@/messages/warnings.messages';
import { UntrustedText } from '@/ui/untrusted-text';
import { recoveryPowerParams } from './tx-view';

/**
 * A warning in the reader's words where the app has them (RECOVERY_POWER from its typed params, the window in words
 * of the reader's language; GUARDIAN_VERIFY_OUT_OF_BAND by its code), else the SDK's English message as untrusted
 * text: it can name a token. Shared by TxCard, /sign/ (T4) and the create review (T7).
 */
export function WarningText({ warning, max = 280 }: { warning: Warning; max?: number }) {
  const t = useT(messages);
  const { lang } = useLang();
  const p = recoveryPowerParams(warning);
  if (p) return <>{t('recoveryPower', { k: p.k, n: p.n, window: durationWords(p.window, lang) })}</>;
  // A fixed text of the SDK, not chain text: said in the reader's words.
  if (warning.code === 'GUARDIAN_VERIFY_OUT_OF_BAND') return <>{t('guardianOutOfBand')}</>;
  return (
    <span lang="en">
      <UntrustedText value={warning.message} max={max} />
    </span>
  );
}
