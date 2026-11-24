import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import deployment from '../../../../deployments/xlayer.json';
import { ProofLine } from '../../src/shell/proof-line';
import { renderWithProviders } from '../helpers/render';

const KECCAK = deployment.circuits.netlistKeccak.policy;
const SHORT = `${KECCAK.slice(0, 6)}…${KECCAK.slice(-4)}`;

/** Characters as a reader counts them: `…`, `→` and each Vietnamese letter are one. */
const length = (s: string | null) => Array.from((s ?? '').normalize('NFC')).length;

function variants() {
  const line = screen.getByTestId('proof-line');
  const wide = line.querySelector<HTMLElement>('[data-variant="wide"]');
  const narrow = line.querySelector<HTMLElement>('[data-variant="narrow"]');
  if (wide === null || narrow === null) throw new Error('the proof line needs a wide and a narrow variant');
  return { line, wide, narrow };
}

describe('ProofLine', () => {
  it('states the frozen netlist and links it to the proof and its limits', () => {
    renderWithProviders(<ProofLine />);
    const { line, wide, narrow } = variants();
    expect(line.tagName).toBe('P');
    expect(line.className.split(/\s+/)).toEqual(expect.arrayContaining(['h-6', 'font-mono', 'text-caption']));
    expect(wide.textContent).toBe(`Rules frozen in netlist ${SHORT} on X Layer · unaudited · limits →`);
    expect(narrow.textContent).toBe(`Rules ${SHORT} · unaudited →`);
    expect(wide.className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', 'md:inline']));
    expect(narrow.className.split(/\s+/)).toContain('md:hidden');
    for (const v of [wide, narrow]) {
      const links = Array.from(v.querySelectorAll('a'));
      expect(links).toHaveLength(2);
      expect(links[0].textContent).toBe(SHORT);
      expect(links[0].getAttribute('href')).toBe('/proof/');
      expect(links[0].getAttribute('title')).toBe(KECCAK);
      expect(links[1].getAttribute('href')).toBe('/proof/#limits');
    }
  });

  it('speaks Vietnamese in sentence case', async () => {
    renderWithProviders(<ProofLine />, { lang: 'vi' });
    await waitFor(() => expect(variants().narrow.textContent).toBe(`Luật ${SHORT} · chưa kiểm toán →`));
    expect(variants().wide.textContent).toBe(
      `Luật đóng băng trong netlist ${SHORT} trên X Layer · chưa kiểm toán · giới hạn →`,
    );
  });

  it('fits one line: 36 characters on a phone, 96 from 48rem', async () => {
    // 12 px mono is about 7.2 px a character: 36 fit a 320 px phone inside 16 px gutters, 96 fit 48rem.
    for (const lang of ['en', 'vi'] as const) {
      const { unmount } = renderWithProviders(<ProofLine />, { lang });
      await waitFor(() => expect(variants().narrow.textContent).toContain(lang === 'vi' ? 'Luật' : 'Rules'));
      const { wide, narrow } = variants();
      expect(length(narrow.textContent), `${lang} narrow`).toBeLessThanOrEqual(36);
      expect(length(wide.textContent), `${lang} wide`).toBeLessThanOrEqual(96);
      unmount();
    }
  });
});
