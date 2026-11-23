import { DOCS_BASE_URL } from './docs';

const trim = (base: string) => base.replace(/\/+$/, '');

export const REPO_URL = 'https://github.com/duongnq2798/atropyle';
export const LICENSE_URL = `${REPO_URL}/blob/main/packages/sdk/LICENSE`;
export const XLAYER_URL = 'https://web3.okx.com/xlayer';

export function explorerAddress(base: string, address: string): string {
  return `${trim(base)}/address/${address}`;
}

export function explorerTx(base: string, hash: string): string {
  return `${trim(base)}/tx/${hash}`;
}

export function explorerName(base: string): string {
  try {
    return new URL(base).hostname.endsWith('oklink.com') ? 'OKLink' : 'Explorer';
  } catch {
    return 'Explorer';
  }
}

export function docsHome(docsPath: string | null): string {
  return docsPath ?? `${DOCS_BASE_URL}/`;
}
