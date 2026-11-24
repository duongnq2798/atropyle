import { ROUTES } from '@/routes';

const SDK_SIGN = '#/sign?';

/**
 * The SDK writes `<base>#/sign?p=X`, the form the CLI and agents print. This site's own page is `/sign/#p=X`: the
 * part after `?` is kept byte for byte, so `toSdkSignLink` on the sign page gives back exactly what the SDK made.
 */
export function toSignHref(sdkLink: string, origin: string): string | null {
  const at = sdkLink.indexOf(SDK_SIGN);
  return at < 0 ? null : `${origin}${ROUTES.sign}#${sdkLink.slice(at + SDK_SIGN.length)}`;
}
