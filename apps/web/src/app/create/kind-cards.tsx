'use client';

import { useLang, useT } from '@/i18n/provider';
import { durationWords } from '@/lib/duration';
import { messages } from '@/messages/create.messages';
import { CHOICE_CARD, RADIO, RADIO_DOT } from '@/ui/switch';
import { DRILL_LIFETIME_SECONDS } from './kind';

/** A choice card around a sr-only native radio, drawn as the product's (also the guardian step's two cards). */
export function Choice(p: {
  name: string;
  testId: string;
  checked: boolean;
  title: string;
  help: string;
  onPick(): void;
}) {
  return (
    <label className={CHOICE_CARD}>
      <input
        type="radio"
        name={p.name}
        data-testid={p.testId}
        checked={p.checked}
        onChange={p.onPick}
        className="peer sr-only"
      />
      <span aria-hidden="true" data-part="radio" className={`${RADIO} mt-0.5`}>
        <span className={RADIO_DOT} />
      </span>
      <span className="min-w-0 space-y-1">
        <span className="block font-display text-ink text-lead">{p.title}</span>
        <span className="block text-ink-muted text-small">{p.help}</span>
      </span>
    </label>
  );
}

/** Step 1, also in the prerendered frame before the flow chunk loads (no flows: the hash holds the pick). */
export function KindCards({ drill, onPick }: { drill: boolean; onPick(drill: boolean): void }) {
  const t = useT(messages);
  const { lang } = useLang();
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="sr-only">{t('stepKind')}</legend>
      <Choice
        name="create-kind"
        testId="create-kind-drill"
        checked={drill}
        title={t('kindDrill')}
        help={t('kindDrillHelp', { lifetime: durationWords(DRILL_LIFETIME_SECONDS, lang) })}
        onPick={() => onPick(true)}
      />
      <Choice
        name="create-kind"
        testId="create-kind-real"
        checked={!drill}
        title={t('kindReal')}
        help={t('kindRealHelp')}
        onPick={() => onPick(false)}
      />
    </fieldset>
  );
}
