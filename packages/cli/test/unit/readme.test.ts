import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const README_URLS = ['cli', 'mcp', 'sdk'].map((p) => new URL(`../../../${p}/README.md`, import.meta.url));

/** Lines outside fenced code blocks, with their 1-based numbers. */
function proseLines(md: string): { n: number; line: string }[] {
  let fenced = false;
  const out: { n: number; line: string }[] = [];
  md.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*```/.test(line)) fenced = !fenced;
    else if (!fenced) out.push({ n: i + 1, line });
  });
  return out;
}

/** Problems that a bad bulk edit leaves behind: a broken code span, or a table row with a stray cell. */
export function markdownProblems(md: string): string[] {
  const problems: string[] = [];
  let cells: number | null = null;
  for (const { n, line } of proseLines(md)) {
    if ((line.match(/`/g) ?? []).length % 2 === 1) problems.push(`line ${n}: odd number of backticks`);
    if (!line.startsWith('|')) {
      cells = null;
      continue;
    }
    const count = (line.match(/(?<!\\)\|/g) ?? []).length;
    if (cells !== null && count !== cells) problems.push(`line ${n}: table row has ${count} pipes, not ${cells}`);
    cells = count;
  }
  return problems;
}

describe('package READMEs', () => {
  it('detects the corruption that sed left in the prepare row and paragraphs', () => {
    const header = '| Command | What it does |';
    const row = '| `atropyle prepare` | Hands over: `--format link\\|cast\\|calls\\|json` |';
    const bad = '| `atropyle prepare` | Hands over: `--format link    | cast | calls | okx | json` | \\|cast\\|okx` |';
    expect(markdownProblems([header, row].join('\n'))).toEqual([]);
    expect(markdownProblems([header, bad].join('\n'))).toEqual([
      'line 2: odd number of backticks',
      'line 2: table row has 8 pipes, not 3',
    ]);
    expect(markdownProblems('with `--format `--format link|cast`   | Foundry')).toEqual([
      'line 1: odd number of backticks',
    ]);
  });

  for (const url of README_URLS) {
    it(`${fileURLToPath(url).split(/[\\/]/).slice(-3, -1).join('/')} has balanced code spans and even tables`, () => {
      expect(markdownProblems(readFileSync(url, 'utf8'))).toEqual([]);
    });
  }
});
