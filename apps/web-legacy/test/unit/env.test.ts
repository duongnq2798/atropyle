import { describe, expect, it } from 'vitest';
import { readEnv } from '../../src/env';

describe('readEnv', () => {
  it('defaults to the Pages build on X Layer', () => {
    expect(readEnv({}, '1.0.0')).toEqual({
      target: 'pages',
      chain: 'xlayer',
      deploymentJson: null,
      workerUrl: null,
      telegramBot: null,
      docsPath: null,
      version: '1.0.0',
    });
  });

  it('never keeps a Worker URL in the DeWEB build', () => {
    expect(readEnv({ VITE_TARGET: 'deweb', VITE_WORKER_URL: 'https://w.example.workers.dev' }).workerUrl).toBeNull();
  });

  it('keeps an https Worker URL in the Pages build, without the trailing slash', () => {
    expect(readEnv({ VITE_WORKER_URL: 'https://w.example.workers.dev/' }).workerUrl).toBe(
      'https://w.example.workers.dev',
    );
    expect(readEnv({ VITE_WORKER_URL: 'http://w.example' }).workerUrl).toBeNull();
  });

  it('accepts only a plain Telegram username', () => {
    expect(readEnv({ VITE_TELEGRAM_BOT: 'atropyle_bot' }).telegramBot).toBe('atropyle_bot');
    expect(readEnv({ VITE_TELEGRAM_BOT: '@atropyle_bot' }).telegramBot).toBeNull();
    expect(readEnv({ VITE_TELEGRAM_BOT: 'x' }).telegramBot).toBeNull();
  });

  it('accepts only ./docs/ as the docs path and reads the chain', () => {
    expect(readEnv({ VITE_DOCS_PATH: './docs/' }).docsPath).toBe('./docs/');
    expect(readEnv({ VITE_DOCS_PATH: 'https://evil.example/' }).docsPath).toBeNull();
    expect(readEnv({ VITE_CHAIN: 'local', VITE_DEPLOYMENT: ' {"a":1} ' })).toMatchObject({
      chain: 'local',
      deploymentJson: '{"a":1}',
    });
  });
});
