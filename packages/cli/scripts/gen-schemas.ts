// Writes packages/cli/schemas/<name>.json from the zod schemas (decision 16). --check fails when a committed file differs.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorOutputSchema } from '@atropyle/mcp/ops';
import { DOCS_BASE_URL } from '@atropyle/sdk';
import * as z from 'zod/v4';
import { CLI_SCHEMAS } from '../src/schemas';

const DIR = fileURLToPath(new URL('../schemas/', import.meta.url));

function schemaFiles(): Record<string, string> {
  const all: Record<string, z.ZodType> = { ...CLI_SCHEMAS, error: ErrorOutputSchema };
  const files: Record<string, string> = {};
  for (const [name, schema] of Object.entries(all)) {
    // Every command prints either its output or the error envelope.
    const body = z.toJSONSchema(name === 'error' ? schema : z.union([schema, ErrorOutputSchema]), {
      target: 'draft-2020-12',
      io: 'output',
    }) as Record<string, unknown>;
    const { $schema, ...rest } = body;
    const doc = {
      $schema,
      $id: `${DOCS_BASE_URL}/schemas/${name}.json`,
      title: `atropyle ${name.replace('-', ' ')} --json`,
      ...rest,
    };
    files[`${name}.json`] = `${JSON.stringify(doc, null, 2)}\n`;
  }
  return files;
}

const files = schemaFiles();
if (process.argv.includes('--check')) {
  const present = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')) : [];
  const stale = Object.entries(files)
    .filter(([f, text]) => !existsSync(join(DIR, f)) || readFileSync(join(DIR, f), 'utf8') !== text)
    .map(([f]) => f);
  const extra = present.filter((f) => !(f in files));
  if (stale.length > 0 || extra.length > 0) {
    console.error(
      `schemas out of date: ${[...stale, ...extra].join(', ')}. Run npm run schemas -w packages/cli and commit.`,
    );
    process.exit(1);
  }
  console.log(`schemas: ${Object.keys(files).length} files up to date`);
} else {
  mkdirSync(DIR, { recursive: true });
  for (const [f, text] of Object.entries(files)) writeFileSync(join(DIR, f), text);
  console.log(`schemas: wrote ${Object.keys(files).length} files`);
}
