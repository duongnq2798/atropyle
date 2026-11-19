// Anvil helpers for the devnet and integration tests. Only ever talks to a local anvil; never handles keys.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { constants } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Address, getAddress, type Hex, keccak256 } from 'viem';
import { parseDeployment } from '../../packages/sdk/src/deployments/types';

const CONTRACTS = fileURLToPath(new URL('../../contracts', import.meta.url));

export const ANVIL_ACCOUNTS = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
  '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
  '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
  '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
  '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
] as const satisfies readonly Address[];

export async function rpc(url: string, method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

function listenOnce(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(port, '127.0.0.1', () => {
      const addr = s.address();
      const bound = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => resolve(bound));
    });
  });
}

const freePort = () => listenOnce(0);

/** Fails fast, before anvil is spawned, so a stale devnet is never mistaken for the new one. */
async function assertPortFree(port: number): Promise<void> {
  try {
    await listenOnce(port);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
    throw new Error(
      `Port ${port} is already in use, so a new anvil cannot start. A previous devnet or an orphaned anvil is ` +
        'probably still running. Stop it and retry (Git Bash: taskkill //F //IM anvil.exe; cmd or PowerShell: ' +
        `taskkill /F /IM anvil.exe; macOS or Linux: pkill anvil). On Windows, netstat -ano | findstr :${port} ` +
        'shows which process holds the port.',
    );
  }
}

// Every process started here, so none outlives its owner: killed on normal exit and on SIGINT/SIGTERM/SIGHUP.
const running = new Set<ChildProcess>();
let hooked = false;

function killAll(): void {
  for (const c of running) c.kill();
}

function hookProcess(): void {
  if (hooked) return;
  hooked = true;
  process.on('exit', killAll);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => {
      killAll();
      // Leave the exit to whoever else handles the signal (devnet.ts, vitest); exit only when nobody does.
      if (process.listenerCount(sig) === 1) process.exit(128 + constants.signals[sig]);
    });
  }
}

// A hard kill of the parent (taskkill /F, SIGKILL) runs no exit handler, so a detached watchdog outlives it,
// notices the parent is gone and kills anvil. It also ends on its own once anvil is gone.
const WATCHDOG = `
const [parent, target] = process.argv.slice(1).map(Number);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
setInterval(() => {
  if (!alive(target)) process.exit(0);
  if (!alive(parent)) { try { process.kill(target); } catch {} process.exit(0); }
}, 500);
`;

function guard(child: ChildProcess, pid: number): void {
  const dog = spawn(process.execPath, ['-e', WATCHDOG, String(process.pid), String(pid)], {
    stdio: 'ignore',
    windowsHide: true,
    detached: true,
  });
  dog.unref();
  running.add(child);
  running.add(dog);
  child.once('exit', () => {
    running.delete(child);
    running.delete(dog);
    dog.kill();
  });
}

export interface Anvil {
  url: string;
  port: number;
  stop(): Promise<void>;
}

export async function startAnvil(opts: { port?: number; forkUrl?: string; chainId?: number } = {}): Promise<Anvil> {
  let port: number;
  if (opts.port === undefined) {
    port = await freePort();
  } else {
    port = opts.port;
    await assertPortFree(port);
  }
  const args = ['--port', String(port), '--host', '127.0.0.1', '--silent'];
  if (opts.forkUrl) args.push('--fork-url', opts.forkUrl);
  else args.push('--chain-id', String(opts.chainId ?? 31337));
  const child = spawn('anvil', args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  let spawnError: Error | undefined;
  child.once('error', (e) => {
    spawnError = e;
  });
  let stderr = '';
  child.stderr?.on('data', (d) => {
    stderr = (stderr + String(d)).slice(-4000);
  });
  if (child.pid !== undefined) {
    hookProcess();
    guard(child, child.pid);
  }
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      await rpc(url, 'eth_chainId');
      break;
    } catch {
      if (spawnError)
        throw new Error(`could not start anvil (is Foundry installed and on PATH?): ${spawnError.message}`);
      if (child.exitCode !== null) throw new Error(`anvil exited during startup: ${stderr.trim() || 'no output'}`);
      if (Date.now() > deadline) {
        child.kill();
        throw new Error(`anvil did not start on ${url}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return {
    url,
    port,
    stop: async () => {
      child.kill();
      await exited;
    },
  };
}

interface BroadcastTx {
  transactionType: string;
  contractName: string | null;
  contractAddress: string | null;
}

/** Deploys DeployLocal.s.sol through anvil's unlocked account 0 and returns the deployment JSON. */
export async function deployLocal(rpcUrl: string): Promise<Record<string, unknown>> {
  const r = spawnSync(
    'forge',
    [
      'script',
      'script/DeployLocal.s.sol:DeployLocal',
      '--rpc-url',
      rpcUrl,
      '--broadcast',
      '--unlocked',
      '--sender',
      ANVIL_ACCOUNTS[0],
    ],
    { cwd: CONTRACTS, encoding: 'utf8', windowsHide: true },
  );
  if (r.error) throw new Error(`could not run forge (is Foundry installed and on PATH?): ${r.error.message}`);
  if (r.status !== 0) throw new Error(`forge script DeployLocal failed:\n${r.stdout}\n${r.stderr}`);
  const file = join(CONTRACTS, 'broadcast/DeployLocal.s.sol/31337/run-latest.json');
  const run = JSON.parse(readFileSync(file, 'utf8')) as {
    transactions: BroadcastTx[];
    receipts: { blockNumber: string; contractAddress: string | null }[];
  };
  const created = run.transactions.filter((t) => t.transactionType === 'CREATE');
  const byName = (name: string) =>
    created.filter((t) => t.contractName === name).map((t) => getAddress(t.contractAddress as string));
  const [usdt0, usdc, usdg] = byName('MockERC20');
  const [factory] = byName('AtropyleFactory');
  const [vaultImpl] = byName('AtropyleVault');
  const [cpu] = byName('MockPolicyCPU');
  const [nft] = byName('MockERC721');
  const [multi] = byName('MockERC1155');
  const factoryReceipt = run.receipts.find((x) => x.contractAddress && getAddress(x.contractAddress) === factory);
  if (!factoryReceipt) throw new Error('factory receipt missing from broadcast file');
  const code = (await rpc(rpcUrl, 'eth_getCode', [vaultImpl, 'latest'])) as Hex;
  const json = {
    name: 'local',
    chainId: 31337,
    rpcUrls: [rpcUrl],
    quorumRpcUrls: [[rpcUrl]],
    explorerUrl: null,
    factory,
    factoryBlock: BigInt(factoryReceipt.blockNumber).toString(),
    vaultImpl,
    vaultImplCodehash: keccak256(code),
    cpu,
    policyId: '1',
    treasury: ANVIL_ACCOUNTS[9],
    feeTokens: [usdt0, usdc, usdg],
    circuits: null,
    tapeout: null,
    builderCode: null,
    webUrl: 'http://localhost:5173',
    logsBlockRange: 5000,
    mocks: { nft, multi },
  };
  parseDeployment(json);
  return json;
}

export async function increaseTime(url: string, seconds: number): Promise<void> {
  await rpc(url, 'evm_increaseTime', [seconds]);
  await rpc(url, 'evm_mine');
}
