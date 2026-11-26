import type { IntegrityReport } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { IntegrityChecks } from '../../src/app/status/status-page';
import { renderWithProviders } from '../helpers/render';

const RLO = '‮';
const REPORT: IntegrityReport = {
  ok: false,
  chainId: 196,
  blockNumber: 123n,
  blockTimestamp: 1_795_594_505n,
  rpcs: 2,
  checks: [
    { name: `factory.evil${RLO}txt.exe`, ok: true },
    { name: 'factory.cpu', ok: false, expected: `0xexpected${RLO}one`, actual: `0xactual${RLO}two` },
  ],
  warnings: [{ code: 'SINGLE_RPC', message: `one node${RLO} only` }],
};

describe('the integrity checks on /status/', () => {
  it('show every string that may come from the chain only as cleaned, isolated text', () => {
    const { container } = renderWithProviders(<IntegrityChecks report={REPORT} />);
    const isolated = [...container.querySelectorAll('[data-untrusted]')].map((e) => e.textContent);
    // An unknown check name, the expected and found values of a failing check, and a warning.
    expect(isolated).toEqual(
      expect.arrayContaining(['factory.eviltxt.exe', '0xexpectedone', '0xactualtwo', 'one node only']),
    );
    expect(container.textContent).not.toContain(RLO);
    // A known name gets its label; its raw name stays below it, and it never goes through UntrustedText.
    const cpu = container.querySelector('[data-name="factory.cpu"]');
    expect(cpu?.getAttribute('data-label')).toBe('true');
    const odd = container.querySelector(`[data-name="factory.evil${RLO}txt.exe"]`);
    expect(odd?.getAttribute('data-label')).toBe('false');
  });

  it('names one node operator in the singular, in both languages', () => {
    const one = renderWithProviders(<IntegrityChecks report={{ ...REPORT, rpcs: 1 }} />);
    expect(one.container.textContent).toContain('through one node operator.');
    expect(one.container.textContent).not.toContain('1 node operators');
    one.unmount();
    const vi = renderWithProviders(<IntegrityChecks report={{ ...REPORT, rpcs: 1 }} />, { lang: 'vi' });
    expect(vi.container.textContent).toContain('qua một nhà vận hành node.');
    vi.unmount();
    const two = renderWithProviders(<IntegrityChecks report={REPORT} />);
    expect(two.container.textContent).toContain('through 2 node operators.');
  });
});
