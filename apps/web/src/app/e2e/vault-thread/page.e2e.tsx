'use client';

import { PRESETS } from '@atropyle/sdk';
import type { ReactNode } from 'react';
import type { Address } from 'viem';
import type { ThreadAxis, ThreadInput } from '@/thread/geometry';
import type { ThreadState } from '@/thread/state';
import { Thread } from '@/thread/thread';

/**
 * Vault threads (spec §18.4.2 T6) on one page, for axe, the alignment checks and the review screenshots
 * (test/e2e/vault-thread.spec.ts): the default wave next to two vaults' own, and the guardians' posts at the gate.
 * A fixed "now", so the shots never change. The axes start two and a half periods early, so three check-ins show as
 * knots, the first one whole: a knot at the very start of an axis would be cut in half by the box.
 */
const T0 = 1_795_336_070n; // 2026-11-22 08:27:50 UTC
const { period, threshold, window } = PRESETS.sixMonths;
const P = BigInt(period);
const ALARM = T0 + BigInt(threshold) * P;
const RELEASE = ALARM + BigInt(window);
const VAULT_A: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const VAULT_B: Address = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const ACTIVE: ThreadAxis = {
  from: T0 - 2n * P - P / 2n,
  to: RELEASE,
  now: T0 + P,
  alarmAt: ALARM,
  releaseAt: RELEASE,
  marks: [T0 - 2n * P, T0 - P, T0],
};
const GRACE: ThreadAxis = { ...ACTIVE, now: ALARM + BigInt(window) / 3n };
const RELEASED: ThreadAxis = { ...ACTIVE, now: RELEASE };

const PREVIEWS: { id: string; title: string; state: ThreadState; input: ThreadInput }[] = [
  { id: 'default', title: 'no signature · the default wave', state: 'active', input: { axis: ACTIVE } },
  {
    id: 'vault-a',
    title: 'vault A · 2 of 3 guardians must confirm',
    state: 'active',
    input: { axis: ACTIVE, signature: VAULT_A, posts: { n: 3, k: 2, lit: 0 } },
  },
  {
    id: 'vault-b',
    title: 'vault B · 1 of 2 must confirm',
    state: 'active',
    input: { axis: ACTIVE, signature: VAULT_B, posts: { n: 2, k: 1, lit: 0 } },
  },
  {
    id: 'grace',
    title: 'vault A in grace · one confirmation of two',
    state: 'grace',
    input: { axis: GRACE, signature: VAULT_A, posts: { n: 3, k: 2, lit: 1 } },
  },
  {
    id: 'released',
    title: 'vault A released to three heirs · 50 / 30 / 20',
    state: 'releasedInherit',
    input: { axis: RELEASED, signature: VAULT_A, branches: [5_000, 3_000, 2_000], posts: { n: 3, k: 2, lit: 2 } },
  },
  {
    id: 'five',
    title: 'vault B · five guardians, 3 must confirm, 4 have',
    state: 'active',
    input: { axis: ACTIVE, signature: VAULT_B, posts: { n: 5, k: 3, lit: 4 } },
  },
  {
    id: 'none',
    title: 'vault A · no guardians',
    state: 'active',
    input: { axis: ACTIVE, signature: VAULT_A, posts: { n: 0, k: 0, lit: 0 } },
  },
];

function Item({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div data-preview={id} className="flex min-w-0 flex-col gap-3">
      <h2 className="font-mono text-caption text-ink-muted">{title}</h2>
      {children}
    </div>
  );
}

export default function VaultThreadPreview() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:px-6">
      <h1 className="font-display text-ink text-title">Vault threads</h1>
      {PREVIEWS.map((p) => (
        <Item key={p.id} id={p.id} title={p.title}>
          <Thread state={p.state} {...p.input} className="w-full" />
        </Item>
      ))}
    </div>
  );
}
