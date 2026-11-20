import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import type { Address } from 'viem';
import { expect, inject } from 'vitest';
import type { DevnetInfo } from '../../../../scripts/lib/devnet-env';
import { BIN } from './bin';

export const devnet = (): DevnetInfo => inject('devnet');
export const account = (i: number): Address => devnet().accounts[i];
/** `--deployment <devnet file>`: every e2e command reads the devnet through it. */
export const DEP = (): string[] => ['--deployment', devnet().deploymentFile];
export const tmp = (): string => mkdtempSync(join(tmpdir(), 'atropyle-cli-'));

export interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

function cleanEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', ...extra };
  for (const k of Object.keys(env)) if (k.startsWith('ATROPYLE_') && !(k in extra)) delete env[k];
  return env;
}

/** Runs the built CLI. stdin is empty and not a TTY, as for an agent. */
export function cli(
  args: readonly string[],
  o: { cwd?: string; env?: Record<string, string>; input?: string } = {},
): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd: o.cwd ?? tmp(), env: cleanEnv(o.env ?? {}) });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => {
      stdout += d;
    });
    child.stderr.setEncoding('utf8').on('data', (d: string) => {
      stderr += d;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    child.stdin.end(o.input ?? '');
  });
}

/** stdout must be exactly one JSON object. */
// biome-ignore lint/suspicious/noExplicitAny: test helper over arbitrary command output
export function json<T = Record<string, any>>(r: Run): T {
  const v: unknown = JSON.parse(r.stdout);
  expect(typeof v === 'object' && v !== null && !Array.isArray(v), r.stdout).toBe(true);
  return v as T;
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
const validators = new Map<string, ValidateFunction>();

/** Validates against the committed packages/cli/schemas/<name>.json, as a user of the docs would. */
export function expectSchema(name: string, value: unknown): void {
  let v = validators.get(name);
  if (!v) {
    v = ajv.compile(JSON.parse(readFileSync(new URL(`../../schemas/${name}.json`, import.meta.url), 'utf8')));
    validators.set(name, v);
  }
  expect(v(value), JSON.stringify(v.errors)).toBe(true);
}
