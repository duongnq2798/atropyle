import type { ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';
import { type GlyphName, StateGlyph } from '@/thread/glyphs';

/**
 * A timestamp in the Ledger voice (spec §18.2, 7) with its glyph: the eyebrow of a scene and of each dated row
 * (spec §18.4.3 Task 6: eyebrows become timestamps). `tone` colours the glyph, the thread's gold by default.
 */
export function Stamp({
  glyph,
  tone = 'text-thread',
  children,
  className,
}: {
  glyph: GlyphName;
  tone?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('voice-ledger flex items-center gap-2 text-caption text-ink-muted', className)}>
      <StateGlyph name={glyph} size={14} className={cn('shrink-0', tone)} />
      <span className="min-w-0 text-pretty">{children}</span>
    </span>
  );
}

export interface SceneProps {
  id: string;
  stamp: ReactNode;
  title: string;
  lead: ReactNode;
  ref?: Ref<HTMLElement>;
  /** data-* attributes of the section: a test id, and the state a test or the CSS reads. */
  attrs?: Readonly<Record<`data-${string}`, string | undefined>>;
  children?: ReactNode;
}

/**
 * One scene of the home page (spec §5.1, §18.4.3 Task 6): a stamp, a heading in the Proclaim voice, a lead, then its
 * body. No hook, so a server component can render one too (T7a's bands). T7a adds the spine's node beside it.
 */
export function Scene({ id, stamp, title, lead, ref, attrs, children }: SceneProps) {
  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={`${id}-title`}
      className="scene relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-20 sm:px-6 md:py-28"
      {...attrs}
    >
      <header className="scene-head flex max-w-3xl flex-col gap-4">
        <p>{stamp}</p>
        <h2 id={`${id}-title`} className="voice-proclaim text-balance text-h2">
          {title}
        </h2>
        <p className="text-pretty text-ink-muted text-lead">{lead}</p>
      </header>
      {children}
    </section>
  );
}
