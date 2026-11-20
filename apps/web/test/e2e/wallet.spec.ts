import { ANVIL, expect, test } from './fixtures.ts';
import { rpcCall } from './state.ts';

const REFUSED = [
  ['eth_sendRawTransaction', ['0x02f8']],
  ['personal_sign', ['0x68656c6c6f', ANVIL[1]]],
  ['eth_sign', [ANVIL[1], '0x68656c6c6f']],
  ['eth_signTypedData_v4', [ANVIL[1], '{}']],
  ['eth_signTransaction', [{ from: ANVIL[1], to: ANVIL[2] }]],
] as const;

test('the wallet refuses signing and raw-transaction methods before anvil sees them', async ({
  page,
  state,
  wallet,
}) => {
  const w = await wallet({ account: ANVIL[1] });
  await page.goto(state.siteUrl);
  const before = await rpcCall(state.rpcUrl, 'eth_blockNumber');
  const codes = await page.evaluate(async (cases) => {
    const provider = await new Promise<{ request(a: { method: string; params: unknown[] }): Promise<unknown> }>(
      (resolve) => {
        window.addEventListener('eip6963:announceProvider', (e) => resolve((e as CustomEvent).detail.provider), {
          once: true,
        });
        window.dispatchEvent(new Event('eip6963:requestProvider'));
      },
    );
    const out: unknown[] = [];
    for (const [method, params] of cases) {
      out.push(
        await provider.request({ method, params: [...params] }).then(
          () => 'accepted',
          (e: { code?: number }) => e.code,
        ),
      );
    }
    return out;
  }, REFUSED);
  expect(codes).toEqual(REFUSED.map(() => 4200));
  expect(w.calls.map((c) => c.method)).toEqual(REFUSED.map(([m]) => m));
  expect(await rpcCall(state.rpcUrl, 'eth_blockNumber')).toBe(before);
});
