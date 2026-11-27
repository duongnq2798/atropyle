'use client';

import type { AssetKind, PlanIssue } from '@atropyle/sdk';
import { Check, Plus, X } from 'lucide-react';
import type { TokenBalance } from '@/flows/impl/balances';
import type { AssetRow, TokenChoice } from '@/flows/impl/create-form';
import type { FlowsImpl } from '@/flows/load';
import { useT } from '@/i18n/provider';
import { sameAddress } from '@/lib/address';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/format';
import { messages } from '@/messages/assets.messages';
import { Button } from '@/ui/button';
import { PlainIconButton } from '@/ui/plain-icon-button';
import { RADIO, RADIO_DOT } from '@/ui/switch';
import { TextField } from '@/ui/text-field';
import { AddressInput } from './address-input';
import { issuesAt, useIssueText } from './issue-list';

const KIND_KEY = {
  erc20: 'kindErc20',
  erc721: 'kindErc721',
  erc1155: 'kindErc1155',
} as const satisfies Record<AssetKind, keyof typeof messages.en>;
const KINDS = Object.keys(KIND_KEY) as AssetKind[];

/** A pill around a native radio drawn as the product's (ui/switch.ts): it follows its input, like CHOICE_CARD. */
const PILL =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface-1 px-4 ' +
  'transition-colors duration-150 hover:not-has-checked:border-line-strong has-checked:border-thread has-checked:bg-surface-2 ' +
  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-thread';
/** A native select drawn on the product's field (the heir an NFT goes to). */
const SELECT =
  'h-11 w-full rounded-xl border border-line-strong bg-surface-1 px-3 text-body text-ink transition-colors ' +
  'duration-150 hover:border-ink-muted focus-visible:border-thread';

export interface AssetsEditorProps {
  flows: FlowsImpl;
  rows: readonly AssetRow[];
  /** Number of heirs: an NFT goes to one of them. */
  heirs: number;
  choices: readonly TokenChoice[];
  /** The deployment's circuit as an NFT row, or null before the SDK loads. */
  circuit: AssetRow | null;
  balances: readonly TokenBalance[] | null;
  issues: readonly PlanIssue[];
  showIssues: boolean;
  testId: string;
  /** The page's own heading names the step (the wizard): the legend stays for screen readers only. */
  hideLegend?: boolean;
  onChange(rows: AssetRow[]): void;
}

export function AssetsEditor(p: AssetsEditorProps) {
  const { flows, rows, heirs, choices, circuit, balances, issues, showIssues, testId, hideLegend, onChange } = p;
  const t = useT(messages);
  const issueText = useIssueText(flows);
  const err = (path: string) => {
    const first = showIssues ? issuesAt(issues, path)[0] : undefined;
    return first ? issueText(first) : undefined;
  };
  const full = rows.length >= flows.LIMITS.maxAssets;
  const set = (i: number, patch: Partial<AssetRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const listed = (token: string) => rows.some((r) => r.kind === 'erc20' && sameAddress(r.token.trim(), token));
  // The app's own label for a listed token (XLAYER_TOKENS), never text read from its contract.
  const label = (c: TokenChoice, i: number) => c.symbol ?? t('testToken', { n: i + 1 });
  const balanceOf = (token: string) => balances?.find((x) => sameAddress(x.token, token)) ?? null;
  const amount = (b: TokenBalance) => formatAmount(b.balance ?? 0n, b.decimals, 4);
  const held = (token: string): string | null => {
    const b = balanceOf(token.trim());
    if (!b) return null;
    if (b.balance === null) return t('holdUnknown');
    if (b.balance === 0n) return t('notHeldShort');
    const i = choices.findIndex((c) => sameAddress(c.address, token.trim()));
    const symbol = i < 0 ? '' : ` ${label(choices[i] as TokenChoice, i)}`;
    return t('youHold', { amount: `${amount(b)}${symbol}` });
  };
  const toggle = (c: TokenChoice) =>
    onChange(
      listed(c.address)
        ? rows.filter((r) => !(r.kind === 'erc20' && sameAddress(r.token.trim(), c.address)))
        : [...rows, { kind: 'erc20', token: c.address, id: '', heir: '0' }],
    );
  return (
    <fieldset className="space-y-6">
      <legend className={hideLegend ? 'sr-only' : 'font-display text-h2 text-ink'}>{t('assetsTitle')}</legend>
      <p className="text-body text-ink-muted">{t('assetsHelp')}</p>
      {choices.length > 0 ? (
        <div className="space-y-3">
          <h2 className="font-medium text-ink text-small">{t('quickTitle')}</h2>
          <div className="flex flex-wrap gap-2">
            {choices.map((c, i) => {
              const on = listed(c.address);
              const b = balanceOf(c.address);
              return (
                <button
                  key={c.address}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && full}
                  data-testid={`${testId}-token-${i}`}
                  onClick={() => toggle(c)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-small transition-colors duration-150',
                    on
                      ? 'border-thread bg-surface-2 text-ink'
                      : 'border-line bg-surface-1 text-ink hover:border-line-strong',
                    'disabled:opacity-50',
                  )}
                >
                  {on ? (
                    <Check aria-hidden="true" className="size-4 text-thread" />
                  ) : (
                    <Plus aria-hidden="true" className="size-4 text-ink-muted" />
                  )}
                  <span className="font-medium">{label(c, i)}</span>
                  {b && b.balance !== null ? (
                    <span className="font-mono text-caption text-ink-muted tabular-nums">{amount(b)}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-line border-dashed p-4 text-ink-muted text-small">{t('noAssets')}</p>
      ) : null}
      {rows.map((r, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and the plan check names them by index
          key={i}
          data-testid={`${testId}-asset-${i}`}
          className="space-y-4 rounded-2xl border border-line bg-surface-1 p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-ink text-small">{t('assetN', { n: i + 1 })}</p>
            <PlainIconButton
              icon={X}
              size="sm"
              label={t('removeAsset', { n: i + 1 })}
              data-testid={`${testId}-remove-asset-${i}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="-my-1 -mr-1"
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium text-ink text-small">{t('kind')}</legend>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <label key={k} className={PILL}>
                  <input
                    type="radio"
                    name={`${testId}-asset-${i}-kind`}
                    value={k}
                    checked={r.kind === k}
                    data-testid={`${testId}-asset-${i}-kind-${k}`}
                    onChange={() => set(i, { kind: k })}
                    className="peer sr-only"
                  />
                  <span aria-hidden="true" data-part="radio" className={RADIO}>
                    <span className={RADIO_DOT} />
                  </span>
                  <span className="text-ink text-small">{t(KIND_KEY[k])}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <AddressInput
              flows={flows}
              label={t('tokenAddress')}
              value={r.token}
              testId={`${testId}-asset-${i}-token`}
              error={err(`assets[${i}].token`) ?? err(`assets[${i}]`)}
              onChange={(token) => set(i, { token })}
            />
            {r.kind === 'erc20' && held(r.token) ? (
              <p data-testid={`${testId}-asset-${i}-held`} className="text-caption text-ink-muted">
                {held(r.token)}
              </p>
            ) : null}
          </div>
          {r.kind !== 'erc20' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={t('tokenId')}
                value={r.id}
                inputMode="numeric"
                autoComplete="off"
                mono
                data-testid={`${testId}-asset-${i}-id`}
                error={err(`assets[${i}].id`)}
                onChange={(e) => set(i, { id: e.target.value })}
              />
              {heirs > 1 ? (
                <label className="flex flex-col gap-1.5 font-medium text-ink text-small">
                  {t('pickHeir')}
                  <select
                    className={SELECT}
                    data-testid={`${testId}-asset-${i}-heir`}
                    value={r.heir}
                    onChange={(e) => set(i, { heir: e.target.value })}
                  >
                    {Array.from({ length: heirs }, (_, h) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: heirs are positional (heir 1, heir 2)
                      <option key={h} value={String(h)}>
                        {t('heirN', { n: h + 1 })}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={full}
          icon={<Plus aria-hidden="true" className="size-4" />}
          data-testid={`${testId}-add-nft`}
          onClick={() => onChange([...rows, { kind: 'erc721', token: '', id: '', heir: '0' }])}
        >
          {t('addNft')}
        </Button>
        {circuit ? (
          <Button
            variant="ghost"
            disabled={full}
            data-testid={`${testId}-add-circuit`}
            onClick={() => onChange([...rows, { ...circuit }])}
          >
            {t('addCircuit')}
          </Button>
        ) : null}
      </div>
    </fieldset>
  );
}
