import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FUNCTIONS } from '../../scripts/build-functions';

const BACKEND = fileURLToPath(new URL('../../', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const read = (...parts: string[]) => readFileSync(join(...parts), 'utf8');

/** Every secret the backend reads: get('X') in config.ts, env('X') in the runtime and in the keeper signer. */
function secretNames(): string[] {
  const names = new Set<string>();
  for (const file of ['src/config.ts', 'src/entry/runtime.ts', 'src/keeper/signer.ts']) {
    for (const m of read(BACKEND, file).matchAll(/\b(?:get|env)\('([A-Z][A-Z0-9_]+)'\)/g)) names.add(m[1]);
  }
  return [...names].sort();
}

describe('maintainer docs and CI (spec §10, §15)', () => {
  it('documents every secret the backend reads', () => {
    const names = secretNames();
    expect(names).toEqual(
      expect.arrayContaining([
        'CRON_SECRET',
        'KEEPER_KEY',
        'MAIL_FROM',
        'OPS_EMAIL',
        'RESEND_API_KEY',
        'SITE_URL',
        'SUPABASE_DB_URL',
        'TOKEN_SECRET',
      ]),
    );
    const readme = read(BACKEND, 'README.md');
    for (const n of names) expect(readme, n).toContain(`\`${n}\``);
  });

  it('lists the eight functions and the pinned deploy commands', () => {
    const readme = read(BACKEND, 'README.md');
    for (const f of FUNCTIONS) expect(readme, f).toContain(`\`${f}\``);
    expect(readme).toContain('npx -y supabase@3.2.0 db push');
    expect(readme).toContain('npx -y supabase@3.2.0 functions deploy --use-api');
  });

  it('names the single key exception and the backend commands in AGENTS.md', () => {
    const agents = read(ROOT, 'AGENTS.md');
    expect(agents).toContain('`apps/backend/src/keeper/signer.ts`');
    expect(agents).toContain('| `apps/backend/`');
    expect(agents).toContain('npm run test:e2e -w apps/backend');
    expect(agents).toContain('No CI workflow signs a transaction or deploys the backend');
  });

  it('keeps every CI workflow free of Supabase deploys and backend secrets', () => {
    const dir = join(ROOT, '.github/workflows');
    const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = read(dir, f);
      expect(text, f).not.toMatch(/supabase(@[\d.]+)?\s+(db push|functions deploy|secrets set|link)/);
      expect(text, f).not.toMatch(
        /KEEPER_KEY|RESEND_API_KEY|CRON_SECRET|TOKEN_SECRET|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_URL/,
      );
    }
    expect(read(dir, 'ci.yml')).toContain('npm run test:e2e -w apps/backend');
  });
});
