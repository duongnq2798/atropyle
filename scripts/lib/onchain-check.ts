import type { SiteFile } from './site-files';

export type Where = 'html' | 'inline-css' | 'meta-refresh' | 'css' | 'js';
export interface Finding {
  path: string;
  url: string;
  where: Where;
}
type Hit = Omit<Finding, 'path'>;

// --- Ported from the gateway's static check, https://tapekit.org/.tape/kernel/purity.js (TapeKit SPEC §8). ---
// Keep these regexes identical to the gateway: the badge is decided by them.
const ATTR = /\b(?:src|href|action|poster|data|formaction|background)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const SRCSET = /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi;
const CSS_IMPORT = /@import\s+(?:"([^"]*)"|'([^']*)')/gi;
const META_REFRESH = /<meta[^>]+http-equiv\s*=\s*["']?refresh[^>]*content\s*=\s*["'][^"']*url=([^"'>\s]+)/gi;

/** Off-chain: an absolute http/https/ws/wss/ftp URL or a protocol-relative //host. */
export function isExternal(url: string): boolean {
  const u = String(url || '').trim();
  return /^(?:https?|wss?|ftp):/i.test(u) || u.startsWith('//');
}

function collect(re: RegExp, text: string, out: Hit[], where: Where): void {
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const v = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!v) continue;
    const candidates = re === SRCSET ? v.split(',').map((s) => s.trim().split(/\s+/)[0]) : [v];
    for (const c of candidates) if (isExternal(c)) out.push({ url: c, where });
  }
}

export function scanHtml(text: string): Hit[] {
  const out: Hit[] = [];
  collect(ATTR, text, out, 'html');
  collect(SRCSET, text, out, 'html');
  collect(CSS_URL, text, out, 'inline-css');
  collect(CSS_IMPORT, text, out, 'inline-css');
  collect(META_REFRESH, text, out, 'meta-refresh');
  return out;
}

export function scanCss(text: string): Hit[] {
  const out: Hit[] = [];
  collect(CSS_URL, text, out, 'css');
  collect(CSS_IMPORT, text, out, 'css');
  return out;
}

export function scanSite(files: Map<string, { bytes: Uint8Array; contentType: string }>): {
  pure: boolean;
  external: Finding[];
} {
  const td = new TextDecoder('utf-8', { fatal: false });
  const external: Finding[] = [];
  for (const [path, f] of files) {
    const ct = String(f.contentType || '');
    if (/html/i.test(ct) || /\.html?$/i.test(path)) {
      for (const e of scanHtml(td.decode(f.bytes))) external.push({ path, ...e });
    } else if (/css/i.test(ct) || /\.css$/i.test(path)) {
      for (const e of scanCss(td.decode(f.bytes))) external.push({ path, ...e });
    }
  }
  return { pure: external.length === 0, external };
}

/** Site paths referenced from HTML/CSS, resolved against `fromDir` (ends with `/` or is empty), deduplicated. */
export function collectReferences(text: string, kind: 'html' | 'css', fromDir = ''): string[] {
  const refs: string[] = [];
  const grab = (re: RegExp, s: string) => {
    re.lastIndex = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const v = (m[1] ?? m[2] ?? m[3] ?? '').trim();
      if (re === SRCSET) for (const x of v.split(',')) refs.push(x.trim().split(/\s+/)[0]);
      else refs.push(v);
    }
  };
  if (kind === 'html') {
    grab(ATTR, text);
    grab(SRCSET, text);
    grab(CSS_URL, text);
    grab(CSS_IMPORT, text);
  } else {
    grab(CSS_URL, text);
    grab(CSS_IMPORT, text);
  }
  const out = new Set<string>();
  for (const r of refs) {
    if (!r || isExternal(r) || /^(data:|blob:|#|mailto:|tel:|javascript:|about:)/i.test(r)) continue;
    let u: URL;
    try {
      u = new URL(r, `https://site.tape.invalid/${fromDir}`);
    } catch {
      continue;
    }
    if (u.origin !== 'https://site.tape.invalid') continue;
    let p: string;
    try {
      p = decodeURIComponent(u.pathname).normalize('NFC').replace(/^\/+/, '');
    } catch {
      continue;
    }
    if (p === '' || p.endsWith('/')) p += 'index.html';
    out.add(p);
  }
  return [...out];
}

// --- Plan 4's own layer: absolute URLs written into JavaScript. The gateway does not scan JS. ---

/**
 * The only chain nodes the gateway counts as the site's own on X Layer (Quyết định 4).
 * Mirrors ONCHAIN_RPCS in apps/web/src/lib/rpc.ts; a test keeps the two in step.
 */
export const RPC_HOSTS = ['rpc.xlayer.tech', 'xlayerrpc.okx.com'] as const;

/**
 * Hosts that appear in the bundle but are never requested by the page. Every entry needs a reason.
 * A host that is not listed fails `site:check`, so a new dependency forces a review.
 */
export const TEXT_ONLY_HOSTS: Readonly<Record<string, string>> = {
  'www.oklink.com': 'explorer links (<a href>) built from deployment.explorerUrl; navigation, not a request',
  't.me': 'Telegram deep links to the bot; navigation, not a request',
  'duongnq2798.github.io': 'docs links (DOCS_BASE_URL) and the Pages mirror; navigation, not a request',
  'github.com': 'repository links on #/developers and in error hints; navigation, not a request',
  'www.npmjs.com': 'package links on #/developers; navigation, not a request',
  '*.tapekit.org': 'the site own gateway URL (deployment.webUrl) used in share links; navigation, not a request',
  'viem.sh': 'viem error messages link to the viem docs; text only',
  '4byte.sourcify.dev': 'viem error text embeds this URL (signature lookup help); nothing fetches it',
  'abitype.dev': 'abitype error messages append a docs link ("Docs: https://abitype.dev..."); text only',
  'oxlib.sh': 'ox library docsOrigin, appended to error messages as a docs link; nothing fetches it',
  'docs.soliditylang.org': 'viem error text links to the Solidity cheatsheet; text only',
  'ipfs.io': 'viem default IPFS gateway in NFT/avatar URI parsing; the web app never resolves ENS avatars or NFT URIs',
  'arweave.net': 'viem default Arweave gateway in NFT/avatar URI parsing; the web app never resolves them either',
  'www.w3.org': 'SVG and XLink namespace URIs inside Preact; identifiers, never fetched',
  '127.0.0.1': 'the SDK built-in local devnet deployment; only used when VITE_CHAIN=local',
  localhost: 'webUrl of the SDK built-in local devnet deployment; only used when VITE_CHAIN=local',
};

/** Hosts the page requests only after an explicit user opt-in that warns about the badge. */
export const OPT_IN_HOSTS: Readonly<Record<string, string>> = {
  'xlayer.drpc.org':
    'second RPC operator for verify; only after "Cross-check" on #/status, which warns the badge is lost',
};

export function hostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  const patterns = [...RPC_HOSTS, ...Object.keys(TEXT_ONLY_HOSTS), ...Object.keys(OPT_IN_HOSTS)];
  return patterns.some((p) => (p.startsWith('*.') ? h.endsWith(p.slice(1)) : h === p));
}

// Host is a DNS name or a bracketed IPv6 literal, with an optional port.
const JS_URL = /\b(?:https?|wss?):\/\/(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)(?::\d+)?/gi;

/** `scheme://host[:port]` of every absolute URL literal; template strings like `https://${x}` do not match. */
export function jsUrls(text: string): string[] {
  return [...new Set(text.match(JS_URL) ?? [])];
}

export interface SiteReport {
  ok: boolean;
  external: Finding[];
  js: Finding[];
}

export function checkSite(files: readonly SiteFile[]): SiteReport {
  const { external } = scanSite(new Map(files.map((f) => [f.path, { bytes: f.bytes, contentType: f.contentType }])));
  const td = new TextDecoder('utf-8', { fatal: false });
  const js: Finding[] = [];
  for (const f of files) {
    if (!/\.m?js$/i.test(f.path)) continue;
    for (const url of jsUrls(td.decode(f.bytes))) {
      if (!hostAllowed(new URL(url).hostname)) js.push({ path: f.path, url, where: 'js' });
    }
  }
  return { ok: external.length === 0 && js.length === 0, external, js };
}
