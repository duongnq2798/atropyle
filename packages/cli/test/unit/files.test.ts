import type { AtropyleError } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { readPlan } from '../../src/files';
import { memoryIo } from './memory-io';

describe('readPlan', () => {
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
