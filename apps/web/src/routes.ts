export { legacyTarget } from './theme/boot';

/** Every page of the app (spec §3). Parameters always go after the #, which no server ever receives. */
export const ROUTES = {
  home: '/',
  create: '/create/',
  vault: '/vault/',
  verify: '/verify/',
  sign: '/sign/',
  proof: '/proof/',
  me: '/me/',
  join: '/join/',
  alertsConfirm: '/alerts/confirm/',
  alertsUnsubscribe: '/alerts/unsubscribe/',
  status: '/status/',
  developers: '/developers/',
  privacy: '/privacy/',
} as const;

export type RouteName = keyof typeof ROUTES;
export type NavKey = 'navCreate' | 'navMe' | 'navProof' | 'navDevelopers';

export const NAV: readonly { route: RouteName; key: NavKey }[] = [
  { route: 'create', key: 'navCreate' },
  { route: 'me', key: 'navMe' },
  { route: 'proof', key: 'navProof' },
  { route: 'developers', key: 'navDevelopers' },
];

/** What the proof does not check, written next to the proof (R18.7); /proof/ gives the section `id="limits"`. */
export const LIMITS_HREF = `${ROUTES.proof}#limits`;

export function createHref(mode: 'drill' | 'real' = 'drill'): string {
  return `${ROUTES.create}#${mode}`;
}

export function vaultHref(vault: string): string {
  return `${ROUTES.vault}#${vault}`;
}

export function verifyHref(vault: string): string {
  return `${ROUTES.verify}#${vault}`;
}

export function joinHref(vault: string, role: 'guardian' | 'heir'): string {
  return `${ROUTES.join}#${vault}.${role}`;
}

export function signHref(encodedPayload: string): string {
  return `${ROUTES.sign}#p=${encodedPayload}`;
}

/** `/sign/#p=X` → the `#/sign?p=X` form that `parseSignLink` of the SDK reads, byte for byte. */
export function toSdkSignLink(hash: string): string {
  return `#/sign?${hash.startsWith('#') ? hash.slice(1) : hash}`;
}

const bare = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

export function isCurrent(pathname: string, href: string): boolean {
  return bare(pathname) === bare(href.split('#')[0]);
}
