import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILLS_DIR = fileURLToPath(new URL('../../../skills/', import.meta.url));
export const SKILL_NAMES = ['atropyle-estate-planning', 'atropyle-guardian'] as const;
export const PLACEHOLDERS = [
  '<OWNER>',
  '<HEIR_1>',
  '<HEIR_2>',
  '<GUARDIAN_1>',
  '<GUARDIAN_2>',
  '<NEW_WALLET>',
  '<VAULT>',
  '<GRACE_VAULT>',
  '<TOKEN>',
  '<PLAN_FILE>',
] as const;

/** SKILL.md first, then references/*.md in name order. */
export function skillFiles(skill: string): string[] {
  const refs = join(SKILLS_DIR, skill, 'references');
  const names = existsSync(refs)
    ? readdirSync(refs)
        .filter((f) => f.endsWith('.md'))
        .sort()
    : [];
  return [join(SKILLS_DIR, skill, 'SKILL.md'), ...names.map((f) => join(refs, f))];
}

export function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error('no YAML frontmatter');
  return { frontmatter: m[1], body: m[2] };
}

/** Non-empty, non-comment lines inside ```bash blocks. */
export function commandsOf(text: string): string[] {
  const out: string[] = [];
  let inBash = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      inBash = !inBash && line === '```bash';
      continue;
    }
    if (inBash && line !== '' && !line.startsWith('#')) out.push(line);
  }
  return out;
}
