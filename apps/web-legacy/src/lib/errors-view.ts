import {
  type AtropyleErrorJson,
  DOCS_BASE_URL,
  decodeError,
  ERROR_INFO,
  type ErrorCode,
  errorDocsUrl,
} from '@atropyle/sdk';

interface ErrorView {
  code: ErrorCode;
  message: string;
  hint: string;
  docsUrl: string;
}

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
  return { code: j.code, message: j.message, hint: j.hint, docsUrl: localDocs(errorDocsUrl(j.code), docsPath) };
}
