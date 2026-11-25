/**
 * Commands the site prints: /proof/ now, /developers/ and the home page's agent scene later. commands.test.ts keeps
 * each one in step with the package.json files, .claude-plugin/ and deployments/xlayer.json, and recomputes the
 * answer of STEP_EXAMPLE with the circuits simulator.
 */
export const MCP_PACKAGE = '@atropyle/mcp@0.1.0';

/** The oldest Node.js the CLI runs on (`engines` of packages/cli/package.json). */
export const NODE_MIN = 20;

/**
 * One step() of the policy circuit on the X Layer processor, from state 0 (Active) with all 23 inputs at 0: the
 * #limits row of /proof/ offers it to ask the processor itself. `answer` is what the model of this repository returns,
 * newState then outputs, as `cast` prints them.
 */
export const STEP_EXAMPLE = {
  cpu: '0x523db7bacD35a6EFc384367D66AEC1CBA07a4A05',
  circuit: 3,
  state: '0x00',
  inputs: '0x000000',
  rpc: 'https://rpc.xlayer.tech',
  answer: { next: '0x01', out: '0x01' },
} as const;

export const COMMANDS = {
  verify: 'npx -y atropyle verify',
  sdk: 'npm install @atropyle/sdk viem',
  mcp: `npx -y ${MCP_PACKAGE}`,
  plugin: '/plugin marketplace add duongnq2798/atropyle\n/plugin install atropyle@atropyle',
  skills: 'npx skills add duongnq2798/atropyle',
  step: `cast call ${STEP_EXAMPLE.cpu} "step(uint256,bytes,bytes)(bytes,bytes)" ${STEP_EXAMPLE.circuit} ${STEP_EXAMPLE.state} ${STEP_EXAMPLE.inputs} --rpc-url ${STEP_EXAMPLE.rpc}`,
} as const;

export type CommandName = keyof typeof COMMANDS;

/** The CLI proof with the P9 vectors of a run of this page. The seed only picks test vectors; it is never a wallet seed. */
export function verifyWithSeed(seed: bigint): string {
  return `${COMMANDS.verify} --p9-seed ${seed.toString(10)}`;
}
