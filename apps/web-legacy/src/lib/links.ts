import { DOCS_BASE_URL } from '@atropyle/sdk';

const trim = (base: string) => base.replace(/\/+$/, '');

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

/** Spec §15: `https://t.me/<bot>?start=<vault>-<role>`, vault in lowercase. */
export function telegramLink(bot: string, vault: string, role: 'owner' | 'guardian' | 'heir'): string {
  return `https://t.me/${bot}?start=${vault.toLowerCase()}-${role}`;
}

export function docsHome(docsPath: string | null): string {
  return docsPath ?? `${DOCS_BASE_URL}/`;
}
