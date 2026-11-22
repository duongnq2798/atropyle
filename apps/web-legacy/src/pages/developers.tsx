import { VERSION } from '@atropyle/sdk';
import { docsHome } from '../lib/links';
import type { Sdk } from '../lib/sdk';
import { useDocsPath, useT } from '../ui/app-context';
import { AddressText, CopyButton } from '../ui/components';
import { messages } from './developers.messages';

type Key = keyof typeof messages.en;

export const REPO_URL = 'https://github.com/duongnq2798/atropyle';
const NPM = 'https://www.npmjs.com/package/';
const PACKAGES = ['@atropyle/sdk', 'atropyle', '@atropyle/mcp'] as const;

/** The commands of spec sections 6-8 as Plan 3 (CLI, MCP, plugin) ships them. */
export const COMMANDS = [
  { id: 'sdk', title: 'sdkTitle', help: 'sdkHelp', cmd: 'npm install @atropyle/sdk viem' },
  { id: 'verify', title: 'verifyTitle', help: 'verifyHelp', cmd: 'npx -y atropyle verify' },
  { id: 'mcp', title: 'mcpTitle', help: 'mcpHelp', cmd: 'claude mcp add atropyle -- npx -y atropyle mcp' },
  { id: 'mcpAny', title: 'mcpAnyTitle', help: 'mcpAnyHelp', cmd: 'npx -y @atropyle/mcp' },
  {
    id: 'plugin',
    title: 'pluginTitle',
    help: 'pluginHelp',
    cmd: '/plugin marketplace add duongnq2798/atropyle\n/plugin install atropyle@atropyle',
  },
  { id: 'skills', title: 'skillsTitle', help: 'skillsHelp', cmd: 'npx skills add duongnq2798/atropyle' },
] as const satisfies readonly { id: string; title: Key; help: Key; cmd: string }[];

export function DevelopersPage({ sdk }: { sdk: Sdk }) {
  const t = useT(messages);
  const docsPath = useDocsPath();
  const d = sdk.deployment;
  const explorer = d.explorerUrl;
  const addresses = [
    { id: 'factory', label: t('factory'), address: d.factory },
    { id: 'vaultImpl', label: t('vaultImpl'), address: d.vaultImpl },
    { id: 'cpu', label: t('cpu'), address: d.cpu },
    { id: 'treasury', label: t('treasury'), address: d.treasury },
    ...d.feeTokens.map((token, i) => ({ id: `feeToken-${i}`, label: t('feeToken'), address: token })),
  ];
  return (
    <div class="stack" data-testid="developers">
      <h1>{t('title')}</h1>
      <p class="muted">{t('intro')}</p>
      <p class="row">
        <a class="btn btn-primary" href={docsHome(docsPath)} data-testid="developers-docs">
          {t('docs')}
        </a>
        <a class="btn" href={REPO_URL} target="_blank" rel="noopener noreferrer" data-testid="developers-repo">
          {t('repo')}
        </a>
      </p>
      <p class="muted" data-testid="developers-published">
        {t('published')}
      </p>
      {COMMANDS.map((c) => (
        <section class="card stack" key={c.id}>
          <h2>{t(c.title)}</h2>
          <p class="muted">{t(c.help, { version: VERSION })}</p>
          <pre class="code" data-testid={`developers-cmd-${c.id}`}>
            {c.cmd}
          </pre>
          <CopyButton text={c.cmd} testid={`developers-copy-${c.id}`} />
        </section>
      ))}
      <section class="card stack">
        <h2>{t('packages')}</h2>
        <ul>
          {PACKAGES.map((p) => (
            <li key={p}>
              <a href={`${NPM}${p}`} target="_blank" rel="noopener noreferrer" data-testid={`developers-npm-${p}`}>
                {p}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section class="card stack">
        <h2>{t('contracts', { chain: d.name, id: d.chainId })}</h2>
        <table class="table">
          <tbody>
            {addresses.map((a) => (
              <tr key={a.id} data-testid={`developers-address-${a.id}`}>
                <th>{a.label}</th>
                <td>
                  <AddressText address={a.address} explorer={explorer} />
                </td>
              </tr>
            ))}
            <tr data-testid="developers-address-policyId">
              <th>{t('policyId')}</th>
              <td class="mono">{d.policyId.toString()}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
