import { describe, expect, it } from 'vitest';
import { rpcPlan } from '../../src/lib/rpc';
import { DRPC, fixtureDeployment, OKX } from './fixtures';

describe('rpcPlan', () => {
  it('keeps every operator on GitHub Pages', () => {
    expect(rpcPlan(fixtureDeployment(), 'pages', false)).toEqual({
      read: OKX,
      verify: [OKX, [DRPC]],
      crossCheck: true,
      offchain: [],
    });
  });

  it('uses only the OKX nodes on DeWEB by default', () => {
    expect(rpcPlan(fixtureDeployment(), 'deweb', false)).toEqual({
      read: OKX,
      verify: [OKX],
      crossCheck: false,
      offchain: [],
    });
  });

  it('adds dRPC on DeWEB only when the user opts in, and reports it as off-chain', () => {
    expect(rpcPlan(fixtureDeployment(), 'deweb', true)).toEqual({
      read: OKX,
      verify: [OKX, [DRPC]],
      crossCheck: true,
      offchain: [DRPC],
    });
  });

  it('falls back to the deployment RPCs when none is an OKX node', () => {
    const local = fixtureDeployment({ rpcUrls: ['http://127.0.0.1:8545'], quorumRpcUrls: [['http://127.0.0.1:8545']] });
    expect(rpcPlan(local, 'deweb', false)).toEqual({
      read: ['http://127.0.0.1:8545'],
      verify: [['http://127.0.0.1:8545']],
      crossCheck: false,
      offchain: ['http://127.0.0.1:8545'],
    });
  });
});
