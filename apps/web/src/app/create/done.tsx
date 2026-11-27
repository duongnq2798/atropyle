'use client';

import { QrCode as QrIcon, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Address as Addr } from 'viem';
import { useSdk } from '@/chain/use-sdk';
import { SubscribeForm } from '@/components/subscribe/SubscribeForm';
import type { CreateForm } from '@/flows/impl/create-form';
import type { FlowsImpl } from '@/flows/load';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { explorerAddress, explorerName } from '@/lib/links';
import { messages } from '@/messages/create.messages';
import { joinHref, vaultHref } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { Address } from '@/ui/address';
import { buttonClass } from '@/ui/button';
import { CopyButton } from '@/ui/copy-button';
import { Dialog } from '@/ui/dialog';
import { ExternalLink } from '@/ui/external-link';
import { QrCode } from '@/ui/qr-code';
import { PlanThread, usePreviewModel } from './preview';

type InviteRole = 'guardian' | 'heir';
/** The email form's role; a prop named `role` with a literal reads to the a11y lint as an ARIA role. */
const OWNER = 'owner' as const;

function Invite({ vault, invite: role, people }: { vault: Addr; invite: InviteRole; people: readonly string[] }) {
  const t = useT(messages);
  const [url, setUrl] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setUrl(`${window.location.origin}${joinHref(vault, role)}`);
    setCanShare(typeof navigator.share === 'function');
  }, [vault, role]);
  if (people.length === 0 || !url) return null;
  return (
    <section
      data-testid={`create-invite-${role}`}
      className="space-y-4 rounded-2xl border border-line bg-surface-1 p-5"
    >
      <h3 className="font-medium text-ink text-lead">{role === 'guardian' ? t('inviteGuardian') : t('inviteHeir')}</h3>
      <ul className="space-y-1">
        {people.map((a) => (
          <li key={a}>
            <Address address={a} size="sm" />
          </li>
        ))}
      </ul>
      <p className="break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-caption text-ink-muted">{url}</p>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={url} label={t('copyLink')} showText />
        {canShare ? (
          <button
            type="button"
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
            onClick={() => {
              navigator.share({ title: 'Atropyle', text: t('shareText'), url }).catch(() => undefined);
            }}
          >
            <Share2 aria-hidden="true" className="size-4" /> {t('share')}
          </button>
        ) : null}
        <Dialog
          title={t('qrTitle')}
          size="sm"
          trigger={
            <button
              type="button"
              data-testid={`create-qr-${role}`}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              <QrIcon aria-hidden="true" className="size-4" /> {t('showQr')}
            </button>
          }
        >
          <QrCode value={url} label={t('qrTitle')} size={240} className="mx-auto" />
        </Dialog>
      </div>
    </section>
  );
}

export function DoneStep({
  flows,
  vault,
  form,
  onRestart,
}: {
  flows: FlowsImpl;
  vault: Addr;
  form: CreateForm;
  onRestart(): void;
}) {
  const t = useT(messages);
  const explorer = useSdk().data?.deployment.explorerUrl ?? null;
  const model = usePreviewModel(flows, form);
  const guardians = form.template === 'guarded' ? form.guardians.map((g) => g.trim()).filter((g) => g !== '') : [];
  const heirs = form.heirs.map((h) => h.account.trim());
  return (
    <div data-testid="create-done" data-vault={vault} className="space-y-12">
      <div className="space-y-6 rounded-2xl border border-line bg-surface-1 p-5 sm:p-8">
        <PlanThread model={model} vault={vault} testId="create-done-thread" />
        <p className="text-ink text-lead">{t('doneBody')}</p>
        <div className="space-y-1">
          <p className="text-ink-muted text-small">{t('doneVault')}</p>
          <Address address={vault} explorer={explorer} copy />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <NavLink
            href={vaultHref(vault)}
            data-testid="create-open-vault"
            className={buttonClass({ variant: 'primary', size: 'lg' })}
          >
            {t('doneOpen')}
          </NavLink>
          {explorer ? (
            <ExternalLink href={explorerAddress(explorer, vault)}>
              {t('doneExplorer', { explorer: explorerName(explorer) })}
            </ExternalLink>
          ) : null}
        </div>
      </div>
      <section aria-labelledby="create-invites" className="space-y-4">
        <h2 id="create-invites" className="font-display text-ink text-title">
          {t('invitesTitle')}
        </h2>
        <p className="max-w-prose text-body text-ink-muted">{t('invitesHelp')}</p>
        {/* Two columns only for two invitations: a lone heirs card spans the page rather than leave a hole. */}
        <div className={cn('grid gap-4', guardians.length > 0 && 'md:grid-cols-2')}>
          <Invite vault={vault} invite="guardian" people={guardians} />
          <Invite vault={vault} invite="heir" people={heirs} />
        </div>
      </section>
      <section aria-labelledby="create-email" className="space-y-4">
        <h2 id="create-email" className="font-display text-ink text-title">
          {t('emailTitle')}
        </h2>
        <SubscribeForm vault={vault} role={OWNER} compact />
      </section>
      <div className="border-line border-t pt-6">
        <button
          type="button"
          data-testid="create-restart"
          className={buttonClass({ variant: 'secondary' })}
          onClick={onRestart}
        >
          {t('newVault')}
        </button>
      </div>
    </div>
  );
}
