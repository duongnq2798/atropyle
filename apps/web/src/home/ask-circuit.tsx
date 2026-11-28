'use client';

import { ArrowRight } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/count';
import { messages as home } from '@/messages/home.messages';
import { ROUTES } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { ASKABLE, AskXLayer } from './ask-x-layer';
import { caseOf, HERO_CASES, type HeroCase, LETTER } from './hero-cases';
import { CIRCUIT, RELEASE } from './hero-circuit';
import { ARROW, CHIP_FACE, DOOR } from './look';

const CHIP_KEY = { alive: 'askAlive', silent: 'askSilent', liar: 'askLiar' } as const;
const ANSWER_KEY = { alive: 'answerAlive', silent: 'answerSilent', liar: 'answerLiar' } as const;

/**
 * Ask the circuit (spec §18.4.3 Task 5′): three native radios. CSS (home.css) lights the wires that carry 1 for
 * the checked question, shows its answer and rings the release pin, through :has(), so it works without JavaScript;
 * HomeHero mirrors the choice in `data-ask` for browsers without :has() and for "Ask X Layer". All three answers share
 * one grid cell, so a chip never moves the page.
 */
export function AskCircuit({
  choice,
  onChoice,
  className,
}: {
  choice: HeroCase;
  onChoice(c: HeroCase): void;
  className?: string;
}) {
  const t = useT(home);
  const { lang } = useLang();
  const id = useId();
  const group = useRef<HTMLFieldSetElement>(null);
  // A chip pressed before hydration: CSS already shows it; the state follows here (one query, no layout read).
  useEffect(() => {
    const checked = group.current?.querySelector<HTMLInputElement>('input:checked');
    const c = checked ? caseOf(checked.value) : undefined;
    if (c !== undefined && c !== choice) onChoice(c);
  }, [choice, onChoice]);
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <fieldset ref={group} className="flex flex-col">
        <legend className="mb-3 text-caption text-ink-muted">{t('askLegend')}</legend>
        <div className="flex flex-wrap gap-2">
          {HERO_CASES.map((c) => (
            <label key={c} className="ask-chip relative">
              <input
                type="radio"
                name={id}
                value={LETTER[c]}
                defaultChecked={c === 'alive'}
                aria-describedby={`${id}-${LETTER[c]}`}
                onChange={() => onChoice(c)}
                className="sr-only"
              />
              <span className={CHIP_FACE}>{t(CHIP_KEY[c])}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="ask-answer grid text-body">
        {HERO_CASES.map((c) => (
          <p
            key={c}
            id={`${id}-${LETTER[c]}`}
            data-for={LETTER[c]}
            className="col-start-1 row-start-1 flex items-start gap-2.5 text-pretty"
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-[0.32em] size-[0.75em] shrink-0 rounded-full border-2',
                RELEASE[c] ? 'border-release bg-release/30' : 'border-thread',
              )}
            />
            {t(ANSWER_KEY[c])}
          </p>
        ))}
      </div>
      <p className="max-w-2xl text-pretty text-ink-muted text-small">
        {t('askCaption', { nand: CIRCUIT.nands, latch: CIRCUIT.latches, depth: CIRCUIT.depths })}{' '}
        {/* One piece: broken after "Run" it read as two links. It fits a 320 px screen in both languages. */}
        <NavLink href={ROUTES.proof} prefetch={false} className={cn(DOOR, 'whitespace-nowrap')}>
          {t('askRunAll', { cases: formatCount(CIRCUIT.cases, lang) })}
          <ArrowRight aria-hidden="true" strokeWidth={2} className={ARROW} />
        </NavLink>
      </p>
      {ASKABLE ? <AskXLayer key={choice} choice={choice} /> : null}
    </div>
  );
}
