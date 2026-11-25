import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILD_OUT = fileURLToPath(new URL('./.out', import.meta.url));
/** In the environment of both builds; must reach only the vercel build (test/build/api-url.test.ts). */
export const API_SENTINEL = 'https://api.atropyle.invalid/functions/v1';
/** In apps/web/.env.production.local during both builds; must reach neither. */
export const DOTENV_SENTINEL = 'https://dotenv.atropyle.invalid/functions/v1';
/** The RPC host of a devnet deployment in the same file; must reach neither build, whose CSP never allows it. */
export const DOTENV_RPC_HOST = 'dotenv-rpc.atropyle.invalid';
export const DOTENV_DEPLOYMENT = JSON.stringify({ chainId: 31337, rpcUrls: [`http://${DOTENV_RPC_HOST}`] });
export const outOf = (target: 'vercel' | 'deweb'): string => join(BUILD_OUT, target);
