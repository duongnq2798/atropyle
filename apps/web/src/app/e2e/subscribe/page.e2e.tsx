'use client';

import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '@/api/client';
import type { OkResponse, Role, SubscribeRequest } from '@/api/types';
import { HostedFormView, HostedOnlyNote, SubscribeForm } from '@/components/subscribe/SubscribeForm';

/**
 * Every state of SubscribeForm on one page, for axe, the keyboard path and the review screenshots
 * (test/e2e/subscribe.spec.ts). The e2e build is DeWEB, where the real form is the hosted-only note, so the hosted
 * form runs here on stand-in mutations, and nothing leaves the page.
 */
const VAULT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

/** The roles as values: Biome's useValidAriaRole reads a literal `role="heir"` on any element as an ARIA role. */
const ROLE = { owner: 'owner', guardian: 'guardian', heir: 'heir' } as const;

type Send = (req: SubscribeRequest) => Promise<OkResponse>;
const accept: Send = () => Promise.resolve({ ok: true });
const refuse: Send = () => Promise.reject(new ApiError('RATE_LIMITED', 429, 'preview: rate limited'));
const hang: Send = () => new Promise<OkResponse>(() => {});

function Item({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div data-preview={id} className="flex min-w-0 flex-col gap-3">
      <h2 className="font-mono text-caption text-ink-muted">{title}</h2>
      {children}
    </div>
  );
}

function FormItem({
  id,
  title,
  role,
  compact = false,
  send,
}: {
  id: string;
  title: string;
  role: Role;
  compact?: boolean;
  send: Send;
}) {
  const sub = useMutation<OkResponse, Error, SubscribeRequest>({ mutationFn: send });
  return (
    <Item id={id} title={title}>
      <HostedFormView vault={VAULT} role={role} compact={compact} sub={sub} />
    </Item>
  );
}

export default function SubscribePreview() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-10 sm:px-6">
      <h1 className="font-display text-ink text-title">SubscribeForm</h1>
      <FormItem id="owner" title="owner · full · idle" role={ROLE.owner} send={accept} />
      <FormItem id="refused" title="owner · full · refused (RATE_LIMITED)" role={ROLE.owner} send={refuse} />
      <div className="grid gap-10 md:grid-cols-2">
        <FormItem id="sent" title="heir · compact · sent" role={ROLE.heir} compact send={accept} />
        <FormItem id="invalid" title="guardian · compact · invalid email" role={ROLE.guardian} compact send={accept} />
        <FormItem id="sending" title="heir · compact · sending" role={ROLE.heir} compact send={hang} />
        <Item id="note" title="DeWEB note · heir · with webUrl">
          <HostedOnlyNote vault={VAULT} role={ROLE.heir} compact webUrl="https://atropyle.xyz/" />
        </Item>
        <Item id="note-bare" title="DeWEB note · guardian · no webUrl">
          <HostedOnlyNote vault={VAULT} role={ROLE.guardian} compact webUrl={null} />
        </Item>
        <Item id="live" title="SubscribeForm of this build (DeWEB)">
          <SubscribeForm vault={VAULT} role={ROLE.owner} compact />
        </Item>
      </div>
    </div>
  );
}
