'use client';

import { type ComponentType, useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { LangBridge, type LangValue, useLang } from '@/i18n/provider';
import { whenIdle } from '@/lib/lazy-chunk';

const ISLAND_ID = 'stage-island';

/**
 * Keeps the server's HTML of the island through the page's hydration: React neither hydrates nor rewrites the children
 * of an element with dangerouslySetInnerHTML, and this one writes nothing, the constant empty string
 * (no-html-sinks.test.ts). The stage's own root hydrates those children later (HomeStageIsland).
 */
const KEEP = { __html: '' } as const;

/**
 * The stage for the prerender. Next replaces `typeof window` at build time, so the browser's bundle drops this branch
 * and its require: there the stage comes from its own chunk (HomeStageIsland), after the first load.
 */
const PRERENDER: ComponentType | null =
  typeof window === 'undefined' ? (require('./stage') as typeof import('./stage')).HomeStage : null;

/** Starts `task` once the page is idle after hydration or `el` comes within half a screen of the viewport. */
function whenWanted(el: Element | null, task: () => void): () => void {
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
 * The page's language, fed to the stage's root: English while React hydrates it, as the static HTML is (Quyết định 15,
 * i18n/provider.tsx), then the page's own. useSyncExternalStore reads the server snapshot during hydration and the
 * current one right after it.
 */
interface LangFeed {
  get(): LangValue;
  english(): LangValue;
  set(value: LangValue): void;
  subscribe(listener: () => void): () => void;
}

function langFeed(first: LangValue): LangFeed {
  let value = first;
  const english: LangValue = { lang: 'en', setLang: first.setLang };
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    english: () => english,
    set(next) {
      if (next === value) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function StageRoot({ Stage, feed }: { Stage: ComponentType; feed: LangFeed }) {
  const value = useSyncExternalStore(feed.subscribe, feed.get, feed.english);
  return (
    <LangBridge value={value}>
      <Stage />
    </LangBridge>
  );
}

/**
 * The home stage (stage.tsx) out of the first load of / (R23, the merge of Plans 7B and 7C). The server renders the
 * whole stage. In the browser the page's hydration keeps that HTML as it stands (KEEP), its controls disabled exactly
 * as before hydration, until the page is idle or the reader scrolls near it; then the stage's chunk loads and a React
 * root of its own hydrates the stage in place: the same nodes, so nothing the reader sees or holds is replaced, and its
 * controls come alive. The stage reads only the language from the page's providers (LangBridge). If the chunk cannot
 * load (offline, a new deploy), the prerendered stage stays, as without JavaScript. After a move within the site there
 * is no prerendered stage: its chunk loads at once.
 */
export function HomeStageIsland() {
  const lang = useLang();
  const [feed] = useState(() => langFeed(lang));

  useEffect(() => feed.set(lang), [feed, lang]);

  useEffect(() => {
    const island = document.getElementById(ISLAND_ID);
    // The prerendered stage, when the page was loaded here; none after a move within the site, which renders the
    // island in the browser (with nothing to hydrate the stage loads at once and renders afresh).
    const prerendered = island?.firstElementChild ?? null;
    let live = true;
    let root: Root | null = null;
    const load = () => {
      import('./stage').then(
        (m) => {
          if (!live || !island) return;
          const stage = <StageRoot Stage={m.HomeStage} feed={feed} />;
          if (prerendered) {
            root = hydrateRoot(island, stage);
          } else {
            root = createRoot(island);
            root.render(stage);
          }
        },
        () => {},
      );
    };
    let cancel = () => {};
    if (prerendered) cancel = whenWanted(prerendered, load);
    else load();
    return () => {
      live = false;
      cancel();
      const done = root;
      // A root cannot unmount while React renders the page's tree, which is what runs this cleanup.
      if (done) setTimeout(() => done.unmount(), 0);
    };
  }, [feed]);

  if (PRERENDER) {
    return (
      <div id={ISLAND_ID} className="contents">
        <PRERENDER />
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
