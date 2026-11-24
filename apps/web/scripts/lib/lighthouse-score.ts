/** Spec §11 runs Lighthouse on `/`, `/create/` and `/proof/`; Plan 7B adds `/create/`, Plan 7C Task 3 adds `/proof/`. */
export const LIGHTHOUSE_ROUTES: readonly string[] = ['/'];

export const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'] as const;

/** Spec §11 on mobile: Performance ≥ 95, the other three 100; LCP ≤ 1.8 s, CLS 0, TBT ≤ 150 ms. */
export const THRESHOLDS = {
  performance: 0.95,
  accessibility: 1,
  bestPractices: 1,
  seo: 1,
  lcpMs: 1800,
  cls: 0,
  tbtMs: 150,
} as const;

/**
 * Requests that must not happen while Lighthouse loads a route (spec §18, R18.18), as a substring of the URL or a
 * RegExp. Empty in Plan 7A; Plan 7C Task 6 adds the SDK, circuits and time-machine chunks of `/`.
 */
export const FORBIDDEN_REQUESTS: Readonly<Record<string, readonly (string | RegExp)[]>> = {};

export interface Run {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  lcpMs: number;
  cls: number;
  tbtMs: number;
}

/** The part of a Lighthouse result the gate reads; the real `Result` type fits it. */
export interface LhrLike {
  categories: Record<string, { score: number | null } | undefined>;
  audits: Record<string, { numericValue?: number; details?: unknown } | undefined>;
}

const score = (lhr: LhrLike, id: string): number => lhr.categories[id]?.score ?? 0;
const metric = (lhr: LhrLike, id: string): number => lhr.audits[id]?.numericValue ?? Number.POSITIVE_INFINITY;

/** A missing score counts as 0 and a missing metric as infinitely slow, so a broken run never passes. */
export function runOf(lhr: LhrLike): Run {
  return {
    performance: score(lhr, 'performance'),
    accessibility: score(lhr, 'accessibility'),
    bestPractices: score(lhr, 'best-practices'),
    seo: score(lhr, 'seo'),
    lcpMs: metric(lhr, 'largest-contentful-paint'),
    cls: metric(lhr, 'cumulative-layout-shift'),
    tbtMs: metric(lhr, 'total-blocking-time'),
  };
}

/** Quyết định 24: the run with the median Performance score; its other numbers come with it. */
export function medianRun(runs: readonly Run[]): Run {
  if (runs.length === 0) throw new Error('no Lighthouse run');
  const sorted = [...runs].sort((a, b) => a.performance - b.performance);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Every threshold the run misses, one readable line each; empty when it passes. */
export function failures(r: Run): string[] {
  const out: string[] = [];
  const atLeast = (name: string, got: number, want: number) => {
    if (!(got >= want)) out.push(`${name} ${got} < ${want}`);
  };
  const atMost = (name: string, got: number, want: number, unit = '') => {
    if (!(got <= want)) out.push(`${name} ${got}${unit} > ${want}${unit}`);
  };
  atLeast('performance', r.performance, THRESHOLDS.performance);
  atLeast('accessibility', r.accessibility, THRESHOLDS.accessibility);
  atLeast('best-practices', r.bestPractices, THRESHOLDS.bestPractices);
  atLeast('seo', r.seo, THRESHOLDS.seo);
  atMost('LCP', Math.round(r.lcpMs), THRESHOLDS.lcpMs, ' ms');
  atMost('CLS', Math.round(r.cls * 1000) / 1000, THRESHOLDS.cls);
  atMost('TBT', Math.round(r.tbtMs), THRESHOLDS.tbtMs, ' ms');
  return out;
}

function hasItems(details: unknown): details is { items: readonly unknown[] } {
  return typeof details === 'object' && details !== null && Array.isArray((details as { items?: unknown }).items);
}

/**
 * The URL of every request in the run that matches a pattern, each once, in load order. Reads the table of the
 * `network-requests` audit; a run without that table throws, so the gate can never pass by reading nothing.
 */
export function forbiddenRequests(lhr: LhrLike, patterns: readonly (string | RegExp)[]): string[] {
  const details = lhr.audits['network-requests']?.details;
  if (!hasItems(details)) throw new Error('Lighthouse result has no network-requests table');
  const out: string[] = [];
  for (const item of details.items) {
    const url = typeof item === 'object' && item !== null ? (item as { url?: unknown }).url : undefined;
    if (typeof url !== 'string' || out.includes(url)) continue;
    // String#search ignores lastIndex, so a global RegExp matches the same way on every URL.
    if (patterns.some((p) => (typeof p === 'string' ? url.includes(p) : url.search(p) !== -1))) out.push(url);
  }
  return out;
}
