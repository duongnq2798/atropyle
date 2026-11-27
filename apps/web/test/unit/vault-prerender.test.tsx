import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VaultPage } from '../../src/app/vault/vault-page';
import { memoryKV } from '../../src/lib/store';
import { Providers } from '../../src/shell/providers';

/** The static HTML of /vault/, parsed: what a reader sees before any script runs, and what the boot mark picks from. */
function prerendered(): Document {
  const out = renderToString(
    <Providers kv={memoryKV()}>
      <VaultPage />
    </Providers>,
  );
  return new DOMParser().parseFromString(out, 'text/html');
}

describe('/vault/ before any script runs (7B-P1)', () => {
  it('holds the empty state, shown unless the boot script marked an address, and also without JavaScript', () => {
    const empty = prerendered().querySelector('[data-first-paint="empty"]');
    expect(empty?.querySelector('[data-testid="vault-missing"] h1')?.textContent).toBe('Open a vault');
    expect(empty?.textContent).toContain('Paste the address of a vault');
    expect(empty?.className).toBe('contents [:root[data-hash=address]_&]:hidden');
  });

  it('holds the skeleton too, shown only for an address', () => {
    const wait = prerendered().querySelector('[data-first-paint="wait"]');
    expect(wait?.querySelector('[data-testid="vault-loading"]')).not.toBeNull();
    expect(wait?.className).toBe('hidden [:root[data-hash=address]_&]:contents');
  });

  it('draws the skeleton in the header shape: a thin thread line, two countdowns, Verify and Refresh', () => {
    const wait = prerendered().querySelector('[data-testid="vault-loading"]');
    const thread = wait?.querySelector('[data-testid="vault-loading-thread"]');
    expect(thread?.className).toContain('aspect-[5/1]');
    expect(thread?.className).toContain('w-full');
    expect(thread?.closest('.max-w-3xl')).toBeNull();
    expect(thread?.firstElementChild?.className).toContain('h-[3px]');
    expect(wait?.querySelectorAll('.h-10.w-28')).toHaveLength(2);
    expect(wait?.querySelectorAll('.h-8.rounded-full')).toHaveLength(2);
  });
});
