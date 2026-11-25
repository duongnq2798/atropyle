/**
 * The backend's check of an email address (apps/backend/src/functions/subscribe.ts), copied character for character
 * so that the form refuses exactly what the backend refuses, before it asks; test/unit/subscribe-form.test.tsx
 * compares the two. The backend trims and lowercases first. The form trims, and case never changes the answer.
 */
export function isEmail(s: string): boolean {
  if (s.length < 3 || s.length > 254) return false;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c <= 0x20 || c === 0x7f) return false;
  }
  if (/[<>()[\]\\,;:"]/.test(s)) return false;
  const at = s.indexOf('@');
  if (at < 1 || at !== s.lastIndexOf('@') || at > 64) return false;
  const domain = s.slice(at + 1);
  return /^[^.]+(\.[^.]+)+$/.test(domain) && !domain.startsWith('-');
}
