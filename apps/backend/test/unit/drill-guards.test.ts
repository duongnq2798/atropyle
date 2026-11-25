import { describe, expect, it } from 'vitest';
import {
  assertFreshAnvilFork,
  assertLoopbackRpc,
  assertUpstream,
  checkCall,
  type Fetch,
  type Gate,
  guardFetch,
  isNeverMethod,
  type NodeAnswers,
  RehearsalGuardError,
} from '../../scripts/drill-guards';

const UPSTREAM = 'https://rpc.xlayer.tech/';
const FORK = 'http://127.0.0.1:8546';

/** What a fresh `anvil --fork-url https://rpc.xlayer.tech` answers (anvil 1.9.0, read 25 Nov 2026). */
const fresh = (over: Partial<NodeAnswers> = {}): NodeAnswers => ({
  clientVersion: 'anvil/v1.9.0',
  nodeInfo: { forkConfig: { forkUrl: 'https://rpc.xlayer.tech/', forkBlockNumber: 76826308 } },
  chainId: '0xc4',
  blockNumber: '0x49446c4',
  ...over,
});

describe('assertLoopbackRpc', () => {
  it('accepts plain http on a loopback host with a port, normalized', () => {
    expect(assertLoopbackRpc('http://127.0.0.1:8546')).toBe(FORK);
    expect(assertLoopbackRpc('http://127.0.0.1:8546/')).toBe(FORK);
    expect(assertLoopbackRpc('http://localhost:59683')).toBe('http://localhost:59683');
    expect(assertLoopbackRpc('http://[::1]:8545')).toBe('http://[::1]:8545');
  });

  it.each([
    ['https://rpc.xlayer.tech', /plain http/],
    ['https://xlayerrpc.okx.com', /plain http/],
    ['http://rpc.xlayer.tech:80', /not on localhost/],
    ['http://10.0.0.5:8545', /not on localhost/],
    ['http://127.0.0.1.nip.io:8545', /not on localhost/],
    ['http://127.0.0.1:8545@rpc.xlayer.tech:8545', /not on localhost/],
    ['http://user:pass@127.0.0.1:8545', /user info/],
    ['http://127.0.0.1', /no port/],
    ['http://127.0.0.1:8545/rpc', /path or a query/],
    ['ws://127.0.0.1:8545', /plain http/],
    ['not a url', /not a URL/],
  ])('refuses %s', (url, why) => {
    expect(() => assertLoopbackRpc(url)).toThrow(RehearsalGuardError);
    expect(() => assertLoopbackRpc(url)).toThrow(why);
  });
});

describe('assertUpstream', () => {
  it('takes an https RPC and refuses http or a local node', () => {
    expect(assertUpstream('https://rpc.xlayer.tech')).toBe(UPSTREAM);
    expect(() => assertUpstream('http://rpc.xlayer.tech')).toThrow(/https/);
    expect(() => assertUpstream('https://127.0.0.1:8545')).toThrow(/local node/);
  });
});

describe('assertFreshAnvilFork', () => {
  it('reads the fork block of a fresh anvil fork of X Layer', () => {
    expect(assertFreshAnvilFork(fresh(), 'https://rpc.xlayer.tech')).toEqual({
      forkUrl: UPSTREAM,
      forkBlock: 76826308n,
    });
  });

  it.each<[string, Partial<NodeAnswers>, RegExp]>([
    ['another client', { clientVersion: 'Geth/v1.14.0' }, /not anvil/],
    ['no client version', { clientVersion: undefined }, /not anvil/],
    ['an anvil that is not a fork', { nodeInfo: { forkConfig: {} } }, /not a fork/],
    ['an anvil without forkConfig', { nodeInfo: { forkConfig: null } }, /not a fork/],
    [
      'a fork of another chain',
      { nodeInfo: { forkConfig: { forkUrl: 'https://eth.llamarpc.com/', forkBlockNumber: 1 } } },
      /forks https:\/\/eth\.llamarpc\.com/,
    ],
    ['a fork without fork block', { nodeInfo: { forkConfig: { forkUrl: UPSTREAM } } }, /no fork block/],
    ['chain 31337', { chainId: '0x7a69' }, /chain 0x7a69, not 196/],
    ['a fork someone already used', { blockNumber: '0x49446c5' }, /not fresh/],
  ])('refuses %s', (_name, over, why) => {
    expect(() => assertFreshAnvilFork(fresh(over), UPSTREAM)).toThrow(why);
  });
});

describe('checkCall', () => {
  const closed: Gate = { url: FORK, verified: false };
  const open: Gate = { url: FORK, verified: true };

  it('lets reads through before the fork is verified, and to any URL', () => {
    for (const m of ['eth_chainId', 'eth_call', 'eth_getLogs', 'anvil_nodeInfo', 'web3_clientVersion']) {
      expect(() => checkCall(closed, FORK, m)).not.toThrow();
      expect(() => checkCall(closed, UPSTREAM, m)).not.toThrow();
    }
  });

  it('refuses every write until the fork is verified', () => {
    for (const m of ['eth_sendTransaction', 'anvil_impersonateAccount', 'anvil_setBalance', 'evm_increaseTime']) {
      expect(() => checkCall(closed, FORK, m)).toThrow(/before the anvil fork was verified/);
      expect(() => checkCall(open, FORK, m)).not.toThrow();
    }
  });

  it('refuses a write to any URL but the verified fork', () => {
    expect(() => checkCall(open, UPSTREAM, 'eth_sendTransaction')).toThrow(/not the verified fork/);
    expect(() => checkCall(open, 'http://127.0.0.1:8545', 'eth_sendTransaction')).toThrow(/not the verified fork/);
    expect(() => checkCall(open, `${FORK}/`, 'eth_sendTransaction')).not.toThrow();
  });

  it('never signs or sends a raw transaction, even to the verified fork', () => {
    for (const m of [
      'eth_sendRawTransaction',
      'eth_sendRawTransactionSync',
      'eth_sign',
      'eth_signTransaction',
      'eth_signTypedData_v4',
      'personal_sign',
      'wallet_sendCalls',
    ]) {
      expect(isNeverMethod(m), m).toBe(true);
      expect(() => checkCall(open, FORK, m)).toThrow(/never sent/);
    }
    for (const m of ['eth_sendTransaction', 'anvil_impersonateAccount', 'eth_call', 'eth_simulateV1']) {
      expect(isNeverMethod(m), m).toBe(false);
    }
    expect(() => checkCall(open, FORK, undefined)).toThrow(/without a method/);
  });
});

describe('guardFetch', () => {
  const sent: string[] = [];
  const inner: Fetch = async (_input, init) => {
    sent.push(String(init?.body));
    return new Response('{"jsonrpc":"2.0","id":1,"result":"0x1"}');
  };
  const call = (method: string) => JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] });

  it('checks every call of a batch before anything leaves the process', async () => {
    const gate: Gate = { url: FORK, verified: true };
    const f = guardFetch(gate, inner);
    sent.length = 0;
    await f(FORK, { method: 'POST', body: call('eth_sendTransaction') });
    await f(new URL(FORK), { method: 'POST', body: `[${call('eth_chainId')},${call('evm_mine')}]` });
    expect(sent).toHaveLength(2);
    await expect(
      f(FORK, { method: 'POST', body: `[${call('eth_chainId')},${call('eth_sendRawTransaction')}]` }),
    ).rejects.toThrow(/never sent/);
    await expect(f(UPSTREAM, { method: 'POST', body: call('eth_sendTransaction') })).rejects.toThrow(
      /not the verified fork/,
    );
    expect(sent).toHaveLength(2);
  });

  it('refuses a request it cannot read', async () => {
    const f = guardFetch({ url: FORK, verified: true }, inner);
    await expect(f(FORK, { method: 'POST' })).rejects.toThrow(/without a JSON body/);
    await expect(f(FORK, { method: 'POST', body: 'eth_sendTransaction' })).rejects.toThrow(/not JSON/);
    await expect(f(FORK, { method: 'POST', body: '[]' })).rejects.toThrow(/empty batch/);
  });

  it('lets only reads reach X Layer through the never-verified upstream gate', async () => {
    const f = guardFetch({ url: UPSTREAM, verified: false }, inner);
    await expect(f(UPSTREAM, { method: 'POST', body: call('eth_gasPrice') })).resolves.toBeInstanceOf(Response);
    await expect(f(UPSTREAM, { method: 'POST', body: call('eth_sendTransaction') })).rejects.toThrow(
      /before the anvil fork was verified/,
    );
  });
});
