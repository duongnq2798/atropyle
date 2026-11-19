// npm run devnet:warp -- 3d  → evm_increaseTime + evm_mine on the local devnet.
import { parseDuration } from '../packages/sdk/src/duration';
import { increaseTime, rpc } from './lib/anvil';

const url = process.env.DEVNET_RPC ?? 'http://127.0.0.1:8545';
const arg = process.argv[2];
if (!arg) {
  console.error('usage: npm run devnet:warp -- <duration>   e.g. 45s, 90m, 12h, 3d');
  process.exit(2);
}
const chainId = Number(await rpc(url, 'eth_chainId'));
if (chainId !== 31337) {
  console.error(`refusing to warp chain ${chainId}: devnet only`);
  process.exit(1);
}
const seconds = parseDuration(arg);
await increaseTime(url, seconds);
const block = (await rpc(url, 'eth_getBlockByNumber', ['latest', false])) as { timestamp: string };
console.log(`warped ${seconds}s; block time is now ${new Date(Number(BigInt(block.timestamp)) * 1000).toISOString()}`);
