import { parseDeploymentText, parsePlanText } from '@atropyle/mcp/ops';
import { AtropyleError, type Deployment } from '@atropyle/sdk';
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
    throw new AtropyleError(code, { message: `Cannot read ${file}.`, hint, details: { file, reason } });
  }
}

/** BOM and CRLF are fine; broken JSON is PLAN_INVALID with the file and the parser's position. */
export const readPlan = async (io: Io, file: string): Promise<unknown> =>
  parsePlanText(await readText(io, file, 'PLAN_INVALID'), file);

export const readDeployment = async (io: Io, file: string): Promise<Deployment> =>
  parseDeploymentText(await readText(io, file, 'DEPLOYMENT_INVALID'), file);
