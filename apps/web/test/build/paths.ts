import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILD_OUT = fileURLToPath(new URL('./.out', import.meta.url));
/** Present in the environment of both builds; must reach only the vercel build (Task 14). */
export const API_SENTINEL = 'https://api.atropyle.invalid/functions/v1';
export const outOf = (target: 'vercel' | 'deweb'): string => join(BUILD_OUT, target);
