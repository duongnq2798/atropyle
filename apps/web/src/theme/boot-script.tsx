import { BOOT_SCRIPT } from './boot';

/** In <head>: redirects legacy links and applies the stored theme before anything paints. */
export function BootScript() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant built from two functions of this file's sibling; no input reaches it.
  return <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />;
}
