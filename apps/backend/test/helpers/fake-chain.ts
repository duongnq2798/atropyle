import type { CreatedVault, IntegrityReport, KeeperReport, ScanResult, VaultEvent } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { ChainHead, ChainPort, KeeperRun, ScanRequest, VaultView } from '../../src/chain/port';
import { T0 } from './fixtures';

/** An in-memory chain for unit tests. Every field is public so a test can set the scene and read the calls. */
export class FakeChain implements ChainPort {
  factoryBlock = 100n;
  headBlock = 200n;
  headTime = T0;
  created: CreatedVault[] = [];
  logs: VaultEvent[] = [];
  /** Keyed by lowercase address. */
  views = new Map<string, VaultView>();
  registered = new Set<string>();
  /** Return true to make the scan of [from, to] throw (an RPC failure). */
  failScan: ((from: bigint, to: bigint) => boolean) | null = null;
  /** Lowercase addresses whose view() throws. */
  failView = new Set<string>();
  keeperImpl: (run: KeeperRun) => Promise<KeeperReport> = async (run) => ({
    ranAt: this.headTime,
    dryRun: true,
    keeper: null,
    balance: null,
    stopped: null,
    sent: 0,
    outcomes: run.vaults.map((vault) => ({ vault, decision: null, status: 'idle', nextCheckAt: null })),
  });
  integrityImpl: () => Promise<IntegrityReport> = async () => ({
    ok: true,
    chainId: 196,
    blockNumber: this.headBlock,
    blockTimestamp: this.headTime,
    rpcs: 2,
    checks: [{ name: 'factory code', ok: true }],
    warnings: [],
  });
  calls = { scan: [] as ScanRequest[], view: [] as Address[], keeper: [] as KeeperRun[] };

  /** Stores the view and registers the vault with the factory. */
  setView(v: VaultView): void {
    this.views.set(v.vault.toLowerCase(), v);
    this.registered.add(v.vault.toLowerCase());
  }

  async head(): Promise<ChainHead> {
    return { number: this.headBlock, timestamp: this.headTime };
  }

  async scan(o: ScanRequest): Promise<ScanResult> {
    this.calls.scan.push(o);
    const from = o.resume.toBlock + 1n;
    const to = o.toBlock;
    if (from > to) {
      const cursor = { toBlock: from - 1n, vaults: o.resume.vaults };
      return { fromBlock: from, toBlock: from - 1n, created: [], events: [], cursor, truncated: false };
    }
    if (this.failScan?.(from, to)) throw new Error(`scan ${from}-${to} failed`);
    const created = this.created.filter((c) => c.blockNumber >= from && c.blockNumber <= to);
    const vaults = [...o.resume.vaults, ...created.map((c) => c.vault)];
    const known = new Set(vaults.map((v) => v.toLowerCase()));
    const events = this.logs.filter(
      (e) => e.blockNumber >= from && e.blockNumber <= to && known.has(e.address.toLowerCase()),
    );
    return { fromBlock: from, toBlock: to, created, events, cursor: { toBlock: to, vaults }, truncated: false };
  }

  /** One second per block, ending at headTime. */
  async blockTime(block: bigint): Promise<bigint> {
    return this.headTime - (this.headBlock - block);
  }

  async view(vault: Address): Promise<VaultView> {
    this.calls.view.push(vault);
    const key = vault.toLowerCase();
    if (this.failView.has(key)) throw new Error(`view of ${vault} failed`);
    const v = this.views.get(key);
    if (!v) throw new Error(`no view for ${vault}`);
    return v;
  }

  async isVault(vault: Address): Promise<boolean> {
    return this.registered.has(vault.toLowerCase());
  }

  async keeper(run: KeeperRun): Promise<KeeperReport> {
    this.calls.keeper.push(run);
    return this.keeperImpl(run);
  }

  async integrity(): Promise<IntegrityReport> {
    return this.integrityImpl();
  }
}
