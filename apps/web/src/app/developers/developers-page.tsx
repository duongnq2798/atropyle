'use client';

import { ENV, explorerUrlOf } from '@/config/env';
import { COMMANDS, type PinnedCommands } from '@/content/commands';
import { SDK_SNIPPET } from '@/content/sdk-snippet';
import { Stamp } from '@/home/scene';
import { useT } from '@/i18n/provider';
import { docsHome, LICENSE_URL, REPO_URL } from '@/lib/links';
import { messages as dev } from '@/messages/developers.messages';
import { Address } from '@/ui/address';
import { CommandLine } from '@/ui/command-line';
import { CopyButton } from '@/ui/copy-button';
import { ExternalLink } from '@/ui/external-link';
import { networkName } from '@/wallet/network';

const EXPLORER = explorerUrlOf(ENV);
/** The four packages on npm; developers-page.test checks each link (ledger note 26/11 14:40). */
export const PACKAGES = ['@atropyle/sdk', 'atropyle', '@atropyle/mcp', '@atropyle/circuits'] as const;
type Key = keyof typeof dev.en;

export type ContractKind = 'factory' | 'vaultImpl' | 'cpu' | 'treasury' | 'feeToken' | 'tapeoutFactory';
export interface DevContract {
  id: string;
  kind: ContractKind;
  /** The fee token's number, from 1; null for the others. */
  n: number | null;
  address: string;
}
export interface DevCircuit {
  id: 'policy' | 'kofn5' | 'ge4';
  circuitId: string;
  keccak: string;
}
export interface DevelopersProps {
  version: string;
  commands: PinnedCommands;
  chainId: number;
  policyId: string;
  contracts: readonly DevContract[];
  circuits: readonly DevCircuit[];
  xlayerCpu: string;
}

const CIRCUIT_KEY = { policy: 'circuitPolicy', kofn5: 'circuitKofn5', ge4: 'circuitGe4' } as const;

function Heading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="voice-proclaim text-h2">
      {children}
    </h2>
  );
}

export function DevelopersPage({
  version,
  commands,
  chainId,
  policyId,
  contracts,
  circuits,
  xlayerCpu,
}: DevelopersProps) {
  const t = useT(dev);
  const install: readonly { id: string; title: Key; help: Key; lines: readonly string[] }[] = [
    { id: 'sdk', title: 'sdkTitle', help: 'sdkHelp', lines: [COMMANDS.sdk] },
    { id: 'verify', title: 'verifyTitle', help: 'verifyHelp', lines: [commands.verify] },
    { id: 'mcp', title: 'mcpTitle', help: 'mcpHelp', lines: [commands.mcpClaude, commands.mcpAny] },
    { id: 'plugin', title: 'pluginTitle', help: 'pluginHelp', lines: [COMMANDS.plugin] },
    { id: 'skills', title: 'skillsTitle', help: 'skillsHelp', lines: [COMMANDS.skills] },
  ];
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-3">
        <Stamp glyph="mark">{t('stamp')}</Stamp>
        <h1 className="voice-proclaim text-h1">{t('title')}</h1>
        <p className="text-pretty text-ink-muted text-lead">{t('lead')}</p>
        <p
          data-testid="dev-published"
          className="voice-ledger inline-flex items-center gap-2 self-start rounded-full border border-line bg-surface-1 px-3 py-1 text-small"
        >
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-alive" />
          {t('published', { version })}
        </p>
      </header>

      <section aria-labelledby="dev-install" className="flex flex-col gap-6">
        <Heading id="dev-install">{t('installTitle')}</Heading>
        <ul className="flex flex-col gap-6">
          {install.map((x) => (
            <li key={x.id} data-testid={`dev-install-${x.id}`} className="flex min-w-0 flex-col gap-2">
              <h3 className="font-medium">{t(x.title)}</h3>
              <p className="text-pretty text-ink-muted text-small">{t(x.help)}</p>
              {x.lines.map((line) => (
                <CommandLine key={line} command={line} label={t('copyCommand')} />
              ))}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="dev-snippet" className="flex min-w-0 flex-col gap-3">
        <Heading id="dev-snippet">{t('snippetTitle')}</Heading>
        <p className="text-pretty text-ink-muted">{t('snippetHelp')}</p>
        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface-2">
          <div className="flex items-center justify-between gap-3 border-line border-b py-1.5 pr-2 pl-4">
            <span translate="no" className="voice-ledger text-caption text-ink-muted">
              {PACKAGES[0]}
            </span>
            <CopyButton text={SDK_SNIPPET} label={t('copyCode')} />
          </div>
          {/* Focusable, so a keyboard can scroll the lines that do not fit (axe: scrollable-region-focusable). */}
          <pre
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard
            tabIndex={0}
            translate="no"
            className="overflow-x-auto p-4 font-mono text-small leading-relaxed outline-thread focus-visible:outline-2 focus-visible:-outline-offset-2"
          >
            {SDK_SNIPPET}
          </pre>
        </div>
      </section>

      <section aria-labelledby="dev-contracts" className="flex min-w-0 flex-col gap-3">
        <Heading id="dev-contracts">{t('contractsTitle')}</Heading>
        <p className="text-ink-muted">{t('contractsLead', { network: networkName(chainId) })}</p>
        <ul className="flex flex-col divide-y divide-line">
          {contracts.map((c) => (
            <li
              key={c.id}
              data-testid={`dev-contract-${c.id}`}
              data-address={c.address}
              className="flex min-w-0 flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
            >
              <span className="text-ink-muted text-small">
                {c.kind === 'feeToken' ? t('feeToken', { n: c.n ?? 0 }) : t(c.kind)}
              </span>
              <Address address={c.address} explorer={EXPLORER} />
            </li>
          ))}
        </ul>
        <p data-testid="dev-policy" className="voice-ledger text-small">
          {t('policy', { id: policyId })}
        </p>
      </section>

      {circuits.length > 0 ? (
        <section aria-labelledby="dev-circuits" className="flex min-w-0 flex-col gap-3">
          <Heading id="dev-circuits">{t('circuitsTitle')}</Heading>
          <p className="text-pretty text-ink-muted">{t('circuitsLead')}</p>
          <p className="flex min-w-0 flex-col gap-1">
            <span className="text-ink-muted text-small">{t('xlayerCpu')}</span>
            <Address address={xlayerCpu} />
          </p>
          <ul className="flex flex-col gap-3">
            {circuits.map((c) => (
              <li
                key={c.id}
                data-testid={`dev-circuit-${c.id}`}
                className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-surface-1 p-4"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{t(CIRCUIT_KEY[c.id])}</span>
                  <span className="voice-ledger text-small">{t('circuitId', { id: c.circuitId })}</span>
                </span>
                <span className="text-caption text-ink-muted">{t('netlist')}</span>
                <span className="flex min-w-0 items-start gap-2">
                  <code translate="no" className="voice-ledger min-w-0 flex-1 text-small wrap-anywhere">
                    {c.keccak}
                  </code>
                  <CopyButton text={c.keccak} label={t('copyKeccak')} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="dev-links" className="flex flex-col gap-3">
        <Heading id="dev-links">{t('linksTitle')}</Heading>
        <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <li>
            <ExternalLink href={REPO_URL}>{t('repo')}</ExternalLink>
          </li>
          <li>
            <ExternalLink href={docsHome(ENV.docsPath)}>{t('docs')}</ExternalLink>
          </li>
          {PACKAGES.map((name) => (
            <li key={name}>
              <ExternalLink href={`https://www.npmjs.com/package/${name}`}>{t('npm', { name })}</ExternalLink>
            </li>
          ))}
          <li>
            <ExternalLink href={LICENSE_URL}>{t('license')}</ExternalLink>
          </li>
        </ul>
        <p className="voice-ledger text-caption text-ink-muted">{t('siteVersion', { version: ENV.version })}</p>
      </section>
    </div>
  );
}
