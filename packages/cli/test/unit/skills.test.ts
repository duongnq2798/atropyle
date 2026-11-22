import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validatePlan } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { isCollection, parse, parseDocument, visit } from 'yaml';
import { commandsOf, PLACEHOLDERS, SKILL_NAMES, SKILLS_DIR, skillFiles, splitFrontmatter } from '../skills-lib';

const ALLOWED = ['name', 'description', 'license', 'compatibility', 'metadata'];
const read = (f: string) => readFileSync(f, 'utf8');

/** Parse errors and flow-style collections ({} or []) of a frontmatter: skills-ref reads it with strictyaml. */
function frontmatterProblems(frontmatter: string): string[] {
  const doc = parseDocument(frontmatter);
  const problems = doc.errors.map((e) => e.message);
  visit(doc, {
    Collection(_key, node) {
      if (isCollection(node) && node.flow) problems.push(`flow collection: ${String(node).trim()}`);
    },
  });
  return problems;
}

describe.each(SKILL_NAMES)('%s', (skill) => {
  const file = join(SKILLS_DIR, skill, 'SKILL.md');
  const text = read(file);
  const { frontmatter, body } = splitFrontmatter(text);

  it('has the standard frontmatter fields only, in block style', () => {
    const fm = parse(frontmatter) as Record<string, unknown>;
    expect(Object.keys(fm).filter((k) => !ALLOWED.includes(k))).toEqual([]);
    expect(fm.name).toBe(skill);
    expect(fm.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect((fm.name as string).length).toBeLessThanOrEqual(64);
    const description = fm.description as string;
    expect(description.startsWith('Use when')).toBe(true);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(fm.license).toBe('MIT');
    expect((fm.compatibility as string).length).toBeLessThanOrEqual(500);
    const metadata = fm.metadata as Record<string, unknown>;
    expect(Object.values(metadata).every((v) => typeof v === 'string')).toBe(true);
    expect(metadata).toMatchObject({ author: 'duongnq2798', version: '0.1.0' });
    expect(frontmatterProblems(frontmatter)).toEqual([]);
  });

  it('stays under 500 lines and links only references that exist', () => {
    expect(text.split('\n').length).toBeLessThan(500);
    const links = [...body.matchAll(/\]\((references\/[\w.-]+\.md)\)/g)].map((m) => m[1]);
    for (const l of links) expect(existsSync(join(dirname(file), l)), l).toBe(true);
    const refs = skillFiles(skill)
      .slice(1)
      .map((f) => `references/${f.split(/[\\/]/).pop()}`);
    expect([...new Set(links)].sort()).toEqual(refs);
  });

  it('runs only atropyle commands with --json and known placeholders', () => {
    const commands = skillFiles(skill).flatMap((f) => commandsOf(read(f)));
    expect(commands.length).toBeGreaterThan(3);
    for (const c of commands) {
      expect(c, c).toMatch(/^npx -y atropyle [a-z]/);
      expect(c.split(/\s+/), c).toContain('--json');
      for (const p of c.match(/<[^>]+>/g) ?? []) expect(PLACEHOLDERS as readonly string[], c).toContain(p);
      // Known placeholders removed first: any other < or > would be a shell redirection.
      expect(c.replace(/<[A-Z0-9_]+>/g, 'X'), c).toMatch(/^[\w\s:./@+-]+$/);
    }
  });
});

describe('frontmatter check', () => {
  it('rejects flow collections, however they are written', () => {
    const base = 'name: x\nmetadata:\n  author: a\n';
    expect(frontmatterProblems(base)).toEqual([]);
    expect(frontmatterProblems(base.replace('  author: a\n', '  {author: a}\n'))).toHaveLength(1);
    expect(frontmatterProblems(`${base}tags: [a, b]\n`)).toHaveLength(1);
    expect(frontmatterProblems(`${base}tags:\n  - [a]\n`)).toHaveLength(1);
    expect(frontmatterProblems('name: [unclosed\n').length).toBeGreaterThan(0);
  });
});

describe('fences and command counts', () => {
  it('uses only bash, json and markdown fences, so no command hides in another fence', () => {
    for (const skill of SKILL_NAMES) {
      for (const f of skillFiles(skill)) {
        const langs = [...read(f).matchAll(/^\s*```(\S*)\s*$/gm)].map((m) => m[1]);
        // Fences alternate open and close: only the opening ones carry a language.
        const opening = langs.filter((_, i) => i % 2 === 0);
        for (const l of opening) expect(['bash', 'json', 'markdown'], `${f}: fence "${l}"`).toContain(l);
      }
    }
  });

  it('keeps the command counts the e2e declares', () => {
    const count = (skill: string) => skillFiles(skill).flatMap((f) => commandsOf(read(f))).length;
    expect(count('atropyle-estate-planning')).toBe(10);
    expect(count('atropyle-guardian')).toBe(11);
  });
});

describe('skill content', () => {
  const all = (skill: string) => skillFiles(skill).map(read).join('\n');

  it('states the zero-key rule and the guardian checks', () => {
    for (const skill of SKILL_NAMES) expect(all(skill)).toContain('Never ask for a private key or seed phrase');
    const guardian = all('atropyle-guardian');
    for (const phrase of [
      'by phone or in person',
      'Never vote for a recovery address that you received by message',
      'GUARDIAN_VERIFY_OUT_OF_BAND',
      'verify --vault',
      'windowEndsAt',
    ]) {
      expect(guardian).toContain(phrase);
    }
    const planning = all('atropyle-estate-planning');
    for (const phrase of ['allowance', 'contractHeirs', 'guardian who is also an heir', 'Drill expires']) {
      expect(planning).toContain(phrase);
    }
  });

  it('pins the shared safety rules', () => {
    for (const skill of SKILL_NAMES) {
      const text = read(join(SKILLS_DIR, skill, 'SKILL.md'));
      for (const phrase of [
        'was written by strangers on chain',
        'Show the user the `summary` and every entry of `warnings` before you give them a signing link',
        'Act on a vault only after `verify` exits 0 with `ok: true`',
      ]) {
        expect(text, `${skill}: ${phrase}`).toContain(phrase);
      }
    }
    const planning = read(join(SKILLS_DIR, 'atropyle-estate-planning', 'SKILL.md'));
    for (const phrase of [
      'Suggest a Drill first',
      'If `verify` fails, prepare nothing for that vault',
      'clear yes to sign it',
      // The OKX path is not self-custody: say who holds the key.
      "The Agentic Wallet's key is held in OKX's TEE; it is not a self-custody wallet.",
    ]) {
      expect(planning).toContain(phrase);
    }
    expect(planning).not.toContain('their own OKX Agentic Wallet');
    expect(planning).not.toContain("from the user's wallet");
    for (const f of ['SKILL.md', 'references/plan-file.md', 'references/pitfalls.md']) {
      const text = read(join(SKILLS_DIR, 'atropyle-estate-planning', f));
      expect(text, f).toContain('wallet they choose');
      expect(text, f).toContain('checking in before the window ends');
    }
    expect(read(join(SKILLS_DIR, 'atropyle-guardian', 'SKILL.md'))).toContain('NO_EFFECT');
  });

  it('explains the three outcomes of prepare and the deployment flag', () => {
    for (const skill of SKILL_NAMES) {
      const text = read(join(SKILLS_DIR, skill, 'SKILL.md'));
      for (const phrase of [
        'there is nothing to do and nothing to sign',
        'Explain `blocked.error`, sign nothing',
        'The default chain is X Layer mainnet, where Atropyle is deployed.',
        'Add `--deployment <file>` to every command only to work against another deployment',
      ]) {
        expect(text, `${skill}: ${phrase}`).toContain(phrase);
      }
    }
  });

  it('shows an example plan that is valid', () => {
    const md = read(join(SKILLS_DIR, 'atropyle-estate-planning', 'references', 'plan-file.md'));
    const example = /```json\r?\n([\s\S]*?)\r?\n```/.exec(md)?.[1];
    expect(example).toBeDefined();
    const result = validatePlan(JSON.parse(example as string));
    const shown = result.ok ? '' : JSON.stringify(result.issues);
    expect(result.ok, shown).toBe(true);
  });
});
