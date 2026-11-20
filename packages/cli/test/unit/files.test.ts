import type { AtropyleError } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { readPlan } from '../../src/files';
import { main } from '../../src/main';
import { memoryIo } from './memory-io';

const PLAN_FILES = {
  'bom.json': '\u{FEFF}{\r\n  "version": 1,\r\n  "heirs": []\r\n}\r\n',
  'broken.json': '{ "version": 1, }',
  'list.json': '[]',
  'string.json': '"plan"',
  'null.json': 'null',
};

describe('readPlan', () => {
  it('reads plan files with a BOM and reports broken JSON', async () => {
    const io = memoryIo({ files: PLAN_FILES });
    expect(await readPlan(io, 'bom.json')).toEqual({ version: 1, heirs: [] });
    const e = (await readPlan(io, 'broken.json').catch((x) => x)) as AtropyleError;
    expect(e).toMatchObject({ code: 'PLAN_INVALID', details: { file: 'broken.json' } });
    expect(e.details?.error).toMatch(/position \d+/);
    for (const name of ['list.json', 'string.json', 'null.json']) {
      expect(await readPlan(io, name).catch((x) => x), name).toMatchObject({
        code: 'PLAN_INVALID',
        details: { file: name },
      });
    }
    expect(((await readPlan(io, 'missing.json').catch((x) => x)) as AtropyleError).code).toBe('PLAN_INVALID');
  });

  it('prints a short error for broken JSON, not a stack trace', async () => {
    const io = memoryIo({ files: PLAN_FILES });
    expect(await main(['plan', 'check', 'broken.json'], io)).toBe(1);
    expect(io.stderr).toMatch(/^error: PLAN_INVALID: broken\.json is not valid JSON\./);
    expect(io.stderr).not.toMatch(/\n\s+at /);
  });

  it('keeps the errno code and fits the hint to it, without file contents', async () => {
    const denied = memoryIo({
      readFile: async () => {
        throw Object.assign(new Error('EACCES: permission denied, secret-contents'), { code: 'EACCES' });
      },
    });
    const e = (await readPlan(denied, 'plan.json').catch((x) => x)) as AtropyleError;
    expect(e).toMatchObject({ code: 'PLAN_INVALID', details: { file: 'plan.json', reason: 'EACCES' } });
    expect(e.hint).toContain('permissions');
    expect(JSON.stringify(e.details)).not.toContain('secret-contents');
    const missing = (await readPlan(memoryIo(), 'plan.json').catch((x) => x)) as AtropyleError;
    expect(missing.details?.reason).toBe('ENOENT');
    expect(missing.hint).toContain('Check the path');
  });
});
