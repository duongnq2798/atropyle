'use client';

import { useT } from '@/i18n/provider';
import { messages as ui } from '@/messages/ui.messages';
import { useHaptics } from '@/motion/haptics';

/** Shown only on devices that can vibrate (spec §4.4: it can be turned off). */
export function HapticsSwitch() {
  const { supported, enabled, setEnabled } = useHaptics();
  const t = useT(ui);
  if (!supported) return null;
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-ink text-small">
      {t('hapticsOn')}
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.currentTarget.checked)}
        className="size-5 accent-thread"
      />
    </label>
  );
}
