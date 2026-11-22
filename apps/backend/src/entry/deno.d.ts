/**
 * The two Deno globals the entries use on Supabase's Edge Runtime. Only src/entry/runtime.ts touches them, inside
 * serve(); Node (the tests) never calls serve().
 */
interface AtropyleDenoGlobal {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
}

declare const Deno: AtropyleDenoGlobal;
