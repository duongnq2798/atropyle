import {
  type AtropyleErrorJson,
  DOCS_BASE_URL,
  decodeError,
  ERROR_INFO,
  type ErrorCode,
  errorDocsUrl,
} from '@atropyle/sdk';

export interface ErrorView {
  code: ErrorCode;
  message: string;
  hint: string;
  docsUrl: string;
}

/**
 * This site's hint for each SDK code whose hint is written for the CLI: a command or flag (`atropyle status`,
 * --rpc, --single-rpc, --chain, --verbose), a field of the CLI's JSON (`from`) or a repo script (npm run, scripts/).
 * A reader of the site can use none of them, and the page prints backticks as they are. In English, like the SDK's
 * own words.
 */
const WEB_HINTS: Partial<Record<ErrorCode, string>> = {
  NOT_OWNER: 'Connect the wallet that owns this vault, then try again.',
  NOT_GUARDIAN: 'Connect the wallet of a guardian of this vault, then try again.',
  ALREADY_RELEASED: 'Only distribute, which pays out the assets, still works after release.',
  BAD_POLICY_OUTPUT:
    'This cannot happen with the verified circuit. Run the proof on this site and report it on GitHub.',
  WRONG_CHAIN: 'Switch your wallet to X Layer (chain 196), then try again.',
  WRONG_ACCOUNT: 'Connect the wallet that must sign this step, then try again.',
  RPC_RATE_LIMITED: 'Wait a moment, then try again.',
  RPC_UNAVAILABLE: 'Check your connection, then try again.',
  QUORUM_UNAVAILABLE: 'Try again later.',
  POLICY_UNAVAILABLE: 'The proof needs a chain whose processor holds the policy netlist, such as X Layer mainnet.',
  DEPLOYMENT_MISSING: 'Atropyle runs on X Layer (chain 196). Switch to it, then try again.',
  DEPLOYMENT_INVALID: 'This copy of the site carries a broken deployment description. Report it on GitHub.',
  UNKNOWN: 'Try again. If it keeps failing, check the transaction on OKLink, if there is one, or report it on GitHub.',
};

/**
 * This site's words for an SDK default message that would contradict the site: POLICY_MISMATCH says "the audited
 * source", and Atropyle is unaudited (ruling R21). A message the SDK wrote for one case is kept.
 */
const WEB_MESSAGES: Partial<Record<ErrorCode, string>> = {
  POLICY_MISMATCH: 'The on-chain policy does not match the published source.',
};

/** An error that crossed postMessage (worker) or came from `Simulation.error`. */
export function isErrorJson(e: unknown): e is AtropyleErrorJson {
  if (!e || typeof e !== 'object' || e instanceof Error) return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.code === 'string' &&
    Object.hasOwn(ERROR_INFO, o.code) &&
    typeof o.message === 'string' &&
    typeof o.hint === 'string'
  );
}

export function localDocs(url: string, docsPath: string | null): string {
  const prefix = `${DOCS_BASE_URL}/`;
  return docsPath && url.startsWith(prefix) ? `${docsPath}${url.slice(prefix.length)}` : url;
}

/** The docs link always comes from the error code, never from a URL carried in the message. */
export function errorView(e: unknown, docsPath: string | null): ErrorView {
  const j: AtropyleErrorJson = isErrorJson(e) ? e : decodeError(e).toJSON();
  const message = j.message === ERROR_INFO[j.code].message ? (WEB_MESSAGES[j.code] ?? j.message) : j.message;
  return {
    code: j.code,
    message,
    hint: WEB_HINTS[j.code] ?? j.hint,
    docsUrl: localDocs(errorDocsUrl(j.code), docsPath),
  };
}
