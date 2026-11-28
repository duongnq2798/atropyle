import { markHash } from '@/lib/hash-mark';
import { KEYS } from '@/lib/store';

/**
 * The old app kept its route in the hash (`#/sign?p=…`, `#/v/<a>/verify`); the SDK, the CLI and the MCP server
 * still print such links. Only the home page redirects, and only the shapes the old app had (spec §3).
 *
 * Self-contained on purpose: its source text runs as the inline boot script, so it uses no import, no outer
 * variable and nothing a compiler would rewrite into a helper call.
 */
export function legacyTarget(pathname: string, hash: string): string | null {
  if (pathname !== '/' && pathname !== '/index.html') return null;
  const m = /^#\/([^?]*)(?:\?(.*))?$/.exec(hash);
  if (m === null) return null;
  const parts = m[1].split('/').filter((p) => p !== '');
  const query = m[2] === undefined ? '' : m[2];
  const first = parts[0];
  if (parts.length === 1) {
    if (first === 'sign') return query === '' ? '/sign/' : `/sign/#${query}`;
    if (first === 'create') return /(^|&)drill=1(&|$)/.test(query) ? '/create/#drill' : '/create/';
    if (first === 'proof' || first === 'status' || first === 'developers') return `/${first}/`;
  }
  if (first === 'v' && parts.length === 2) return `/vault/#${parts[1]}`;
  if (first === 'v' && parts.length === 3 && parts[2] === 'verify') return `/verify/#${parts[1]}`;
  return null;
}

/**
 * Runs before the first paint. Self-contained like legacyTarget, which it receives as an argument. It always leaves a
 * theme on <html> (7C-T12): vellum (`light`) unless storage holds night (`dark`) or match device (`system`), exactly as
 * parseTheme reads it (test/unit/boot.test.ts checks the two agree). `:root` carries vellum as well, so a page whose
 * script never runs is vellum too; the attribute is what the `[data-theme=light]` variants of the components read.
 */
export function boot(themeKey: string, legacy: (pathname: string, hash: string) => string | null): void {
  function redirect(): boolean {
    try {
      const target = legacy(location.pathname, location.hash);
      if (target !== null) {
        location.replace(target);
        return true;
      }
    } catch {
      // A failed redirect leaves the visitor on the home page, which works on its own.
    }
    return false;
  }
  if (redirect()) return;
  // An old link pasted on an open page changes only the fragment: no load, so the check above never sees it.
  try {
    addEventListener('hashchange', redirect);
  } catch {
    // Without the listener such a link stays on the home page, as it did before.
  }
  let theme = 'light';
  try {
    const stored = localStorage.getItem(themeKey);
    if (stored === 'dark' || stored === 'system') theme = stored;
  } catch {
    // Storage is blocked (private window, sandboxed frame): the page stays vellum.
  }
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * The page's only inline script (Quyết định 14). The CSP hashes it after the build (Task 15). Pure, so a client chunk
 * that reaches this module through routes.ts (legacyTarget) does not build the string it never uses.
 */
export const BOOT_SCRIPT = /* @__PURE__ */ (() =>
  `(${boot.toString()})(${JSON.stringify(KEYS.theme)},${legacyTarget.toString()});(${markHash.toString()})();`)();
