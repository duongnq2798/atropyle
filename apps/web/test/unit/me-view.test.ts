// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLI_VAULTS, otherRoles, sectionsOf, truncated, vaultsCommand } from '../../src/app/me/me-view';
import { ME_LIMIT, type MyVault } from '../../src/chain/impl/my-vaults';
import { messages as me } from '../../src/messages/me.messages';
import { messages as shell } from '../../src/messages/shell.messages';
import { PEOPLE } from './fixtures';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const V1 = '0x1111111111111111111111111111111111111111';
const V2 = '0x2222222222222222222222222222222222222222';
const V3 = '0x3333333333333333333333333333333333333333';
const mv = (vault: `0x${string}`, roles: MyVault['roles']): MyVault => ({
  vault,
  owner: PEOPLE.owner,
  drill: true,
  state: 'active',
  roles,
  expired: false,
});

describe('the lists of /me/', () => {
  it('puts a vault under every role the wallet has in it, in the order the chain gave', () => {
    const s = sectionsOf([mv(V1, ['owner']), mv(V2, ['heir', 'guardian']), mv(V3, ['heir'])]);
    expect(s.own.map((v) => v.vault)).toEqual([V1]);
    expect(s.guard.map((v) => v.vault)).toEqual([V2]);
    expect(s.inherit.map((v) => v.vault)).toEqual([V2, V3]);
  });

  it('lists no vault for a recovery target: the factory does not index it', () => {
    const s = sectionsOf([mv(V1, ['recoveryTarget'])]);
    expect([...s.own, ...s.guard, ...s.inherit]).toEqual([]);
  });

  it('names the other roles of a row, never its own section', () => {
    expect(otherRoles(['heir', 'guardian'], 'guard')).toEqual(['heir']);
    expect(otherRoles(['heir', 'guardian'], 'inherit')).toEqual(['guardian']);
    expect(otherRoles(['owner', 'heir', 'guardian', 'recoveryTarget'], 'own')).toEqual(['guardian', 'heir']);
    expect(otherRoles(['owner'], 'own')).toEqual([]);
  });

  it('says the list is cut only when the index holds more entries than the page read', () => {
    expect(truncated({ indexed: 100n, limit: 100 })).toBe(false);
    expect(truncated({ indexed: 101n, limit: 100 })).toBe(true);
  });
});

describe('the command line of /me/', () => {
  it('is the CLI command that reads the same list', () => {
    const cli = JSON.parse(read('../../../../packages/cli/package.json')) as {
      name: string;
      bin: Record<string, string>;
    };
    expect(CLI_VAULTS).toBe(`npx -y ${cli.name} vaults`);
    expect(Object.keys(cli.bin)).toContain(cli.name);
    expect(read('../../../../packages/cli/src/commands/vaults.ts')).toMatch(
      /\.command\('vaults'\)[\s\S]*?\.argument\('<account>'/,
    );
    expect(vaultsCommand(PEOPLE.owner)).toBe(`npx -y atropyle vaults ${PEOPLE.owner}`);
    expect(vaultsCommand(null)).toBe('npx -y atropyle vaults <address>');
  });

  it('reads as many entries as the CLI does (VAULTS_PAGE of the SDK)', () => {
    expect(read('../../../../packages/sdk/src/read/vaults.ts')).toMatch(new RegExp(`const VAULTS_PAGE = ${ME_LIMIT};`));
  });
});

describe('the copy of /me/', () => {
  it('titles the page as the nav names it', () => {
    expect(me.en.title).toBe(shell.en.navMe);
    expect(me.vi.title).toBe(shell.vi.navMe);
  });

  it('states no number of its own: counts come through placeholders (spec §18.2 principle 3)', () => {
    for (const lang of ['en', 'vi'] as const) {
      for (const [key, s] of Object.entries(me[lang])) {
        if (key !== 'rehearse') expect(s, `${lang}.${key}`).not.toMatch(/\d/);
      }
    }
  });
});
