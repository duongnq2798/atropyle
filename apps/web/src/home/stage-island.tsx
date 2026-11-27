'use client';

import { type ComponentType, useEffect, useState } from 'react';
import { whenIdle } from '@/lib/lazy-chunk';

const ISLAND_ID = 'stage-island';

/**
 * Keeps the server's HTML of the island through hydration: React neither hydrates nor rewrites the children of an
 * element with dangerouslySetInnerHTML, and this one writes nothing, the constant empty string (no-html-sinks.test.ts).
 */
const KEEP = { __html: '' } as const;

/**
 * The stage for the prerender. Next replaces `typeof window` at build time, so the browser's bundle drops this branch
 * and its require: there the stage comes from its own chunk (load below), after the first load.
 */
const PRERENDER: ComponentType | null =
  typeof window === 'undefined' ? (require('./stage') as typeof import('./stage')).HomeStage : null;

/** Starts `task` once the page is idle after hydration or the island comes within half a screen of the viewport. */
function whenWanted(el: HTMLElement | null, task: () => void): () => void {
  let done = false;
  let io: IntersectionObserver | null = null;
  let cancelIdle = () => {};
  const go = () => {
    if (done) return;
    done = true;
    io?.disconnect();
    cancelIdle();
    task();
  };
  if (el && typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && go(), {
      rootMargin: '50% 0px',
    });
    io.observe(el);
  }
  cancelIdle = whenIdle(go);
  return () => {
    done = true;
    io?.disconnect();
    cancelIdle();
  };
}

/**
 * The home stage (stage.tsx) out of the first load of / (R23, the merge of Plans 7B and 7C). The server renders the
 * whole stage. In the browser the island keeps that HTML as it stands (KEEP: React has nothing to hydrate in it), its
 * controls disabled exactly as before hydration, until the page is idle or the reader scrolls near it; then the
 * stage's chunk loads and the stage mounts in its place, the same markup with its controls live. A language chosen before that shows once the stage mounts, as the rest of the page shows it after
 * hydration. If the chunk cannot load (offline, a new deploy), the prerendered stage stays, as without JavaScript.
 */
export function HomeStageIsland() {
  const [Live, setLive] = useState<ComponentType | null>(null);

  useEffect(
    () =>
      whenWanted(document.getElementById(ISLAND_ID), () => {
        import('./stage').then(
          (m) => setLive(() => m.HomeStage),
          () => {},
        );
      }),
    [],
  );

  if (PRERENDER) {
    return (
      <div id={ISLAND_ID} className="contents">
        <PRERENDER />
      </div>
    );
  }
  if (Live) {
    return (
      <div id={ISLAND_ID} className="contents">
        <Live />
      </div>
    );
  }
  return (
    <div
      id={ISLAND_ID}
      className="contents"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the constant empty string; see KEEP.
      dangerouslySetInnerHTML={KEEP}
      suppressHydrationWarning
    />
  );
}
