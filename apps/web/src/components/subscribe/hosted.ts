import { joinHref, vaultHref } from '@/routes';

/**
 * Where a DeWEB reader signs up for alerts: the vault's page for the owner, the join link of the role for a guardian
 * or an heir, on the site the deployment names (`webUrl`). The query and the fragment of `webUrl` are dropped and a
 * path is kept. Null for anything but an http or https URL, and the note then shows no link.
 */
export function hostedHref(
  webUrl: string,
  vault: string,
  role: 'owner' | 'guardian' | 'heir',
): { href: string; host: string } | null {
  let u: URL;
  try {
    u = new URL(webUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const base = `${u.origin}${u.pathname.replace(/\/*$/, '/')}`;
  const path = role === 'owner' ? vaultHref(vault) : joinHref(vault, role);
  return { href: `${base}${path.replace(/^\/+/, '')}`, host: u.host };
}
