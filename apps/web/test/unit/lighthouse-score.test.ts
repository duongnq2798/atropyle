// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  failures,
  forbiddenRequests,
  hostNote,
  LCP_ELEMENT,
  type LhrLike,
  lcpElementPath,
  lcpFailures,
  medianRun,
  type Run,
  runOf,
  SLOW_HOST_BENCHMARK,
  THRESHOLDS,
} from '../../scripts/lib/lighthouse-score';

const PASS: Run = { performance: 0.97, accessibility: 1, bestPractices: 1, seo: 1, lcpMs: 1500, cls: 0, tbtMs: 90 };

const SITE = 'http://127.0.0.1:4000';

/** A result whose network-requests audit lists these rows, as Lighthouse 13 writes them. */
function withRequests(items: readonly unknown[]): LhrLike {
  return { categories: {}, audits: { 'network-requests': { details: { type: 'table', headings: [], items } } } };
}

describe('lighthouse score', () => {
  it('reads the four categories and three metrics; a missing one counts as a failure', () => {
    const lhr = {
      categories: {
        performance: { score: 0.96 },
        accessibility: { score: 1 },
        'best-practices': { score: null },
        seo: { score: 1 },
      },
      audits: {
        'largest-contentful-paint': { numericValue: 1700.4 },
        'cumulative-layout-shift': { numericValue: 0 },
      },
    };
    expect(runOf(lhr)).toEqual({
      performance: 0.96,
      accessibility: 1,
      bestPractices: 0,
      seo: 1,
      lcpMs: 1700.4,
      cls: 0,
      tbtMs: Number.POSITIVE_INFINITY,
    });
  });

  it("keeps the host's CPU benchmark of each run, which simulated TBT scales with", () => {
    const lhr: LhrLike = { categories: {}, audits: {}, environment: { benchmarkIndex: 1834.5 } };
    expect(runOf(lhr).benchmarkIndex).toBe(1834.5);
    expect(runOf({ categories: {}, audits: {} }).benchmarkIndex).toBeUndefined();
  });

  it('flags a host at or below the benchmark where Lighthouse warns of a slow CPU, and only then', () => {
    expect(hostNote({ ...PASS, benchmarkIndex: SLOW_HOST_BENCHMARK })).toMatch(
      /benchmark 1000 .*cpuSlowdownMultiplier/,
    );
    expect(hostNote({ ...PASS, benchmarkIndex: 640.2 })).toMatch(/benchmark 640 /);
    expect(hostNote({ ...PASS, benchmarkIndex: SLOW_HOST_BENCHMARK + 1 })).toBeNull();
    expect(hostNote(PASS)).toBeNull();
    // Informational: the gate itself never reads the benchmark.
    expect(failures({ ...PASS, benchmarkIndex: 100 })).toEqual([]);
  });

  it('takes the run with the median performance score, with its own metrics', () => {
    const runs = [
      { ...PASS, performance: 0.99, lcpMs: 1 },
      { ...PASS, performance: 0.91, lcpMs: 2 },
      { ...PASS, performance: 0.96, lcpMs: 3 },
    ];
    expect(medianRun(runs)).toEqual({ ...PASS, performance: 0.96, lcpMs: 3 });
    expect(() => medianRun([])).toThrow(/no Lighthouse run/);
  });

  it('passes a run that meets every threshold of spec §11, edges included', () => {
    expect(failures(PASS)).toEqual([]);
    const edge = { ...PASS, performance: THRESHOLDS.performance, lcpMs: 1800.4, tbtMs: THRESHOLDS.tbtMs };
    expect(failures(edge)).toEqual([]);
  });

  it('names every threshold a run misses', () => {
    const bad: Run = {
      performance: 0.94,
      accessibility: 0.98,
      bestPractices: 0.96,
      seo: 0.92,
      lcpMs: 1801,
      cls: 0.01,
      tbtMs: 151,
    };
    expect(failures(bad)).toEqual([
      'performance 0.94 < 0.95',
      'accessibility 0.98 < 1',
      'best-practices 0.96 < 1',
      'seo 0.92 < 1',
      'LCP 1801 ms > 1800 ms',
      'CLS 0.01 > 0',
      'TBT 151 ms > 150 ms',
    ]);
  });

  it('rounds CLS to three decimals like the report, so float noise does not fail the gate', () => {
    expect(failures({ ...PASS, cls: 0.0004 })).toEqual([]);
    expect(failures({ ...PASS, cls: 0.0006 })).toEqual(['CLS 0.001 > 0']);
  });

  it('lists each request that matches a forbidden pattern once, in load order', () => {
    const lhr = withRequests([
      { url: `${SITE}/` },
      { url: `${SITE}/_next/static/chunks/sdk-1a2b.js` },
      { url: `${SITE}/_next/static/chunks/app-3c4d.js` },
      { url: `${SITE}/_next/static/chunks/circuits-5e6f.js` },
      { url: `${SITE}/_next/static/chunks/sdk-1a2b.js` },
      { url: `${SITE}/_next/static/chunks/circuits-7a8b.js` },
    ]);
    // A global RegExp keeps state between test() calls; the gate must not depend on it.
    expect(forbiddenRequests(lhr, ['/chunks/sdk-', /circuits-[0-9a-f]+\.js$/g])).toEqual([
      `${SITE}/_next/static/chunks/sdk-1a2b.js`,
      `${SITE}/_next/static/chunks/circuits-5e6f.js`,
      `${SITE}/_next/static/chunks/circuits-7a8b.js`,
    ]);
  });

  it('is empty when nothing matches or no pattern is given, and skips rows without a URL', () => {
    const lhr = withRequests([{ url: `${SITE}/` }, { url: 42 }, 'row', null, {}]);
    expect(forbiddenRequests(lhr, ['/chunks/sdk-'])).toEqual([]);
    expect(forbiddenRequests(lhr, [])).toEqual([]);
  });

  it('fails closed when the run has no network-requests table', () => {
    expect(() => forbiddenRequests({ categories: {}, audits: {} }, ['/chunks/sdk-'])).toThrow(
      /no network-requests table/,
    );
    const noTable: LhrLike = { categories: {}, audits: { 'network-requests': { details: { type: 'opportunity' } } } };
    expect(() => forbiddenRequests(noTable, [])).toThrow(/no network-requests table/);
  });

  it('reads the LCP element from lcp-breakdown-insight, and wants the H1 on /', () => {
    const lhr = (items: unknown[]): LhrLike => ({
      categories: {},
      audits: { 'lcp-breakdown-insight': { details: { type: 'list', items } } },
    });
    const h1 = {
      type: 'node',
      path: '1,HTML,1,BODY,0,DIV,2,MAIN,0,SECTION,0,DIV,0,DIV,0,H1',
      selector: 'div.flex > h1',
    };
    expect(lcpElementPath(lhr([{ type: 'table', items: [] }, h1]))).toBe(h1.path);
    expect(lcpElementPath(lhr([]))).toBeNull();
    expect(lcpElementPath({ categories: {}, audits: {} })).toBeNull();
    expect(LCP_ELEMENT['/'].test(h1.path)).toBe(true);
    expect(LCP_ELEMENT['/'].test('1,HTML,1,BODY,0,DIV,2,MAIN,0,SECTION,0,DIV,0,DIV,3,P')).toBe(false);
  });

  it('fails / unless every run that names an LCP element names its H1, and never passes by reading nothing', () => {
    const h1 = '1,HTML,1,BODY,0,DIV,2,MAIN,0,SECTION,0,DIV,0,DIV,0,H1';
    const lead = '1,HTML,1,BODY,0,DIV,2,MAIN,0,SECTION,0,DIV,0,DIV,3,P';
    expect(lcpFailures('/', [h1, h1, h1])).toEqual([]);
    // A run Lighthouse could not measure is left out by the caller: two H1 runs still pass.
    expect(lcpFailures('/', [h1, h1])).toEqual([]);
    expect(lcpFailures('/', [h1, lead, lead])).toEqual([`LCP element ${lead}, expected one matching /(?:^|,)H1$/`]);
    expect(lcpFailures('/', [])).toEqual(['no measured run reported an LCP element']);
    expect(lcpFailures('/proof/', [])).toEqual([]);
  });
});
