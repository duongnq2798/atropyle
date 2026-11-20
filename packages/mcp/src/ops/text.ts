import { AtropyleError, type Deployment, parseDeployment } from '@atropyle/sdk';

/**
 * Where a JSON syntax error is, and nothing else. V8 quotes the text around the error, and a deployment file can carry
 * RPC URLs with API keys in them.
 */
function syntaxWhere(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  const at = /position \d+(?: \(line \d+ column \d+\))?/.exec(msg);
  if (at) return `JSON syntax error at ${at[0]}`;
  return /end of JSON/i.test(msg) ? 'JSON ends unexpectedly' : 'JSON syntax error';
}

/** Windows Notepad saves UTF-8 with a byte order mark; JSON.parse rejects it. */
export const stripBom = (s: string): string => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

export function parseDeploymentText(text: string, source = 'deployment'): Deployment {
  let raw: unknown;
  try {
    raw = JSON.parse(stripBom(text));
  } catch (e) {
    throw new AtropyleError('DEPLOYMENT_INVALID', {
      message: `${source} is not valid JSON.`,
      details: { file: source, error: syntaxWhere(e) },
    });
  }
  return parseDeployment(raw);
}

export function parsePlanText(text: string, file = 'plan'): unknown {
  try {
    return JSON.parse(stripBom(text));
  } catch (e) {
    throw new AtropyleError('PLAN_INVALID', {
      message: `${file} is not valid JSON.`,
      hint: 'Fix the JSON syntax (the error names the position when the parser knows it), or create a new file with `atropyle plan init`.',
      details: { file, error: syntaxWhere(e) },
    });
  }
}
