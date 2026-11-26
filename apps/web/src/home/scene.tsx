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

/**
 * A block's piece of the story's spine (spec §18.4.3 Task 7a, R18.5; globals.css `.spine-*`): a 2 px line the full
 * height of its block, or down to its node only (`end`, the closing scene). Shown from 78rem, inside `.story` only.
 */
export function SpineSeg({ end = false }: { end?: boolean }) {
  return (
    <span aria-hidden="true" className="spine-seg" {...(end && { 'data-end': '' })}>
      <span className="spine-fill" />
    </span>
  );
}

/**
 * The spine's node, centred on the first line of its anchor. The anchor must be `relative` and start at its block's
 * content edge (the box's 1.5rem padding): globals.css places the node from there.
 */
export function SpineNode() {
  return (
    <span aria-hidden="true" className="spine-node">
      <span />
    </span>
  );
}

export interface SceneProps {
  id: string;
  stamp: ReactNode;
  title: ReactNode;
  lead: ReactNode;
  ref?: Ref<HTMLElement>;
  /** data-* attributes of the section: a test id, and the state a test or the CSS reads. */
  attrs?: Readonly<Record<`data-${string}`, string | undefined>>;
  children?: ReactNode;
}

/**
 * One scene of the home page (spec §5.1, §18.4.3 Task 6): a stamp, a heading in the Proclaim voice, a lead, then its
 * body. No hook, so a server component can render one too (T7a's bands). Its block's piece of the spine (SpineSeg)
 * and the node at its stamp (SpineNode) show only inside `.story`.
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
      <SpineSeg />
      <header className="scene-head flex max-w-3xl flex-col gap-4">
        <p className="relative">
          <SpineNode />
          {stamp}
        </p>
        <h2 id={`${id}-title`} className="voice-proclaim text-balance text-h2">
          {title}
        </h2>
        <p className="text-pretty text-ink-muted text-lead">{lead}</p>
      </header>
      {children}
    </section>
  );
}
