'use client';

import type { Warning } from '@atropyle/sdk';
import { useT } from '@/i18n/provider';
import { formatDuration } from '@/lib/duration';
import { messages } from '@/messages/warnings.messages';
import { UntrustedText } from '@/ui/untrusted-text';
import { recoveryPowerParams } from './tx-view';

/**
 * A warning in the reader's words where the app has them (RECOVERY_POWER, from its typed params), else the SDK's
 * English message as untrusted text: it can name a token. Shared by TxCard, /sign/ (T4) and the create review (T7).
 */
export function WarningText({ warning, max = 280 }: { warning: Warning; max?: number }) {
  const t = useT(messages);
  const p = recoveryPowerParams(warning);
  if (p) return <>{t('recoveryPower', { k: p.k, n: p.n, window: formatDuration(p.window) })}</>;
  return (
    <span lang="en">
      <UntrustedText value={warning.message} max={max} />
    </span>
  );
}
