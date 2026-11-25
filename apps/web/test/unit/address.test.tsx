import { screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { Address } from '../../src/ui/address';
import { renderWithProviders } from '../helpers/render';

const A = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
/** The tags of the e2e audit (test/e2e/helpers.ts), which imports Playwright and so cannot be imported here. */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** The ids axe reports as violations and as needing review. Colour contrast needs a layout, which happy-dom lacks. */
async function audit(root: Element): Promise<{ violations: string[]; incomplete: string[] }> {
  const r = await axe.run(root, {
    runOnly: { type: 'tag', values: AXE_TAGS },
    rules: { 'color-contrast': { enabled: false } },
  });
  return { violations: r.violations.map((v) => v.id), incomplete: r.incomplete.map((v) => v.id) };
}

describe('Address in the Ledger voice', () => {
  it('draws the groups for the eye and gives a screen reader the address once, whole', () => {
    const { container } = renderWithProviders(<Address address={A} />);
    const groups = container.querySelector('[data-part="groups"]');
    expect(groups).toHaveAttribute('aria-hidden', 'true');
    expect(groups).toHaveClass('voice-ledger', 'font-normal');
    // The hanging indent that stands wrapped groups in columns (measured in e2e/wallet.spec.ts, test 1).
    expect(groups).toHaveClass('pl-[1.55ch]', '-indent-[1.55ch]');
    expect(groups?.textContent).toBe(A);
    const spoken = screen.getByText(A);
    expect(spoken.closest('.sr-only')).not.toBeNull();
    expect(spoken.closest('[aria-hidden]')).toBeNull();
    expect(spoken.closest('[data-address]')).toBe(container.querySelector('[data-address]'));
    // Spec §18.4.2: no aria-label on a span or a div; only the copy button and the explorer link carry a name.
    for (const el of container.querySelectorAll('[aria-label]')) expect(['BUTTON', 'A']).toContain(el.tagName);
  });

  it('draws the checksum capitals at weight 650 and every other character at 400', () => {
    const { container } = renderWithProviders(<Address address={A} />);
    const upper = [...container.querySelectorAll('[data-case="upper"]')];
    expect(upper.map((el) => el.textContent)).toEqual(['C', 'C', 'D', 'B', 'FA', 'BC']);
    for (const el of upper) expect(el).toHaveClass('font-[650]');
    // A lowercase address carries no checksum, and a text that is not an address is drawn as it is.
    const lower = renderWithProviders(<Address address={A.toLowerCase()} />);
    expect(lower.container.querySelectorAll('[data-case="upper"]')).toHaveLength(0);
    const name = renderWithProviders(<Address address="Vault.ETH" />);
    expect(name.container.querySelectorAll('[data-case="upper"]')).toHaveLength(0);
    expect(name.container.querySelector('[data-part="groups"]')?.textContent).toBe('Vault.ETH');
    expect(name.container.querySelector('[data-part="groups"]')).not.toHaveClass('pl-[1.55ch]');
  });

  it('passes axe, with the copy button and the explorer link', async () => {
    const { container } = renderWithProviders(<Address address={A} explorer="https://www.oklink.com/xlayer" />);
    const r = await audit(container);
    expect(r.violations).toEqual([]);
    expect(r.incomplete).not.toContain('aria-prohibited-attr');
  });

  it('the audit catches a label on a span over hidden words (its self-test)', async () => {
    // Built by hand: the markup the rule forbids, which the JSX lint would refuse.
    const outer = document.createElement('span');
    outer.setAttribute('aria-label', A);
    const inner = document.createElement('span');
    inner.setAttribute('aria-hidden', 'true');
    inner.textContent = A;
    outer.append(inner);
    const root = document.createElement('div');
    root.append(outer);
    document.body.append(root);
    try {
      expect((await audit(root)).violations).toContain('aria-prohibited-attr');
    } finally {
      root.remove();
    }
  });
});
