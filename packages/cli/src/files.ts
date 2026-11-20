import { parseDeploymentText, parsePlanText } from '@atropyle/mcp/ops';
import { AtropyleError, type Deployment } from '@atropyle/sdk';
import { redactUrl } from './exit';
import type { Io } from './io';

async function readText(io: Io, file: string, code: 'PLAN_INVALID' | 'DEPLOYMENT_INVALID'): Promise<string> {
  try {
    return await io.readFile(file);
  } catch (e) {
    const reason = typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : 'UNKNOWN';
    const hint =
      reason === 'ENOENT'
        ? 'Check the path. A relative path starts from the current directory.'
        : `The file exists but cannot be read (${reason}). Check its permissions, and that it is a file.`;
    // A URL in the wrong flag would otherwise be printed, with any API key in it.
    const name = redactUrl(file);
    throw new AtropyleError(code, { message: `Cannot read ${name}.`, hint, details: { file: name, reason } });
  }
}

/** BOM and CRLF are fine; broken JSON is PLAN_INVALID with the file and the parser's position. */
export async function readPlan(io: Io, file: string): Promise<unknown> {
  const plan = parsePlanText(await readText(io, file, 'PLAN_INVALID'), file);
  if (typeof plan !== 'object' || plan === null || Array.isArray(plan)) {
    throw new AtropyleError('PLAN_INVALID', {
      message: `${file} must hold one JSON object.`,
      hint: 'Create a plan with `atropyle plan init`.',
      details: { file, found: plan === null ? 'null' : Array.isArray(plan) ? 'array' : typeof plan },
    });
  }
  return plan;
}

export const readDeployment = async (io: Io, file: string): Promise<Deployment> =>
  parseDeploymentText(await readText(io, file, 'DEPLOYMENT_INVALID'), file);
