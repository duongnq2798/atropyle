import { deploymentToJson } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { createSdk, loadDeployment } from '../../src/chain/impl/sdk';
import { DRPC, fixtureDeployment, OKX } from './fixtures';

describe('sdk', () => {
  it('rejects a deployment that is not JSON', () => {
    expect(() => loadDeployment({ chain: 'local', deploymentJson: '{' })).toThrowError(
      expect.objectContaining({ code: 'DEPLOYMENT_INVALID' }),
    );
  });

  it('parses a deployment JSON', () => {
    const json = JSON.stringify(deploymentToJson(fixtureDeployment({ name: 'local', chainId: 31337 })));
    const d = loadDeployment({ chain: 'xlayer', deploymentJson: json });
    expect(d.chainId).toBe(31337);
    expect(d.factoryBlock).toBe(1n);
  });

  it('gives the client only the RPCs the target allows', () => {
    const deweb = createSdk(fixtureDeployment(), 'deweb', false);
    expect(deweb.atro.deployment.rpcUrls).toEqual(OKX);
    expect(deweb.rpc.verify).toEqual([OKX]);
    expect(createSdk(fixtureDeployment(), 'deweb', true).rpc.verify).toEqual([OKX, [DRPC]]);
  });
});
