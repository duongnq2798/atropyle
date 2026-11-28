import { VERSION } from '@atropyle/sdk';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DevelopersPage, PACKAGES } from '../../src/app/developers/developers-page';
import { pinnedCommands } from '../../src/content/commands';
import { renderWithProviders } from '../helpers/render';

const PROPS = {
  version: VERSION,
  commands: pinnedCommands(VERSION),
  chainId: 196,
  policyId: '3',
  contracts: [
    { id: 'factory', kind: 'factory', n: null, address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed' },
    { id: 'feeToken-0', kind: 'feeToken', n: 1, address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736' },
  ],
  circuits: [
    { id: 'kofn5', circuitId: '1', keccak: `0x${'ab'.repeat(32)}` },
    { id: 'ge4', circuitId: '2', keccak: `0x${'cd'.repeat(32)}` },
  ],
  xlayerCpu: '0x523db7bacD35a6EFc384367D66AEC1CBA07a4A05',
} as const;

describe('/developers/', () => {
  it('pins every npx command to the SDK version and says the packages are on npm', () => {
    renderWithProviders(<DevelopersPage {...PROPS} />);
    expect(screen.getByText(`npx -y atropyle@${VERSION} verify`)).toBeTruthy();
    expect(screen.getByText(`claude mcp add atropyle -- npx -y @atropyle/mcp@${VERSION}`)).toBeTruthy();
    expect(screen.getByText(`npx -y @atropyle/mcp@${VERSION}`)).toBeTruthy();
    expect(screen.getByTestId('dev-published').textContent).toContain(VERSION);
    expect(screen.getByTestId('dev-contract-factory').getAttribute('data-address')).toBe(PROPS.contracts[0].address);
    expect(screen.getByTestId('dev-contract-feeToken-0').textContent).toContain('Fee token 1');
    expect(screen.getByTestId('dev-circuit-kofn5').textContent).toContain('ab'.repeat(32));
  });

  it('says the CLI proof runs P9 too, and how to rerun its cases (main sync, 7C-T10)', () => {
    renderWithProviders(<DevelopersPage {...PROPS} />);
    const verify = screen.getByTestId('dev-install-verify').textContent ?? '';
    expect(verify).toContain('step()');
    expect(verify).toContain('--p9-seed');
  });

  it('links all four npm packages (ledger note 26/11 14:40)', () => {
    expect(PACKAGES).toEqual(['@atropyle/sdk', 'atropyle', '@atropyle/mcp', '@atropyle/circuits']);
    // vitest builds for deweb: ExternalLink prints a span first and the <a> after mount, which render() has run.
    renderWithProviders(<DevelopersPage {...PROPS} />);
    for (const name of PACKAGES) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      const link = screen.getByRole('link', { name: new RegExp(`^${escaped} on npm`) });
      expect(link.getAttribute('href')).toBe(`https://www.npmjs.com/package/${name}`);
    }
  });

  it('reads in Vietnamese', () => {
    renderWithProviders(<DevelopersPage {...PROPS} />, { lang: 'vi' });
    expect(screen.getByTestId('dev-published').textContent).toContain(`Bản ${VERSION}`);
  });
});
