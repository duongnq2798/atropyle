import { type ActionName, type AtropyleClient, decodeError, type TxPlan } from '@atropyle/sdk';
import type { Hex } from 'viem';
import { plural } from './explain';
import { type PrepareActionInput, type PrepareCreateVaultInput, parseAt } from './inputs';
import { latestTimestamp, planOwner } from './read';
import { type Handoff, type PrepareOutput, PrepareOutputSchema } from './schemas';
import { finish } from './untrusted';

const OKX_UNIVERSAL_LINK = 'https://web3.okx.com/download?deeplink=';

/**
 * Opens `link` in the dApp browser of the OKX App. Format from the OKX "App Universal Link" doc:
 * the okx:// deep link carries the URL-encoded dApp URL, and the whole deep link is URL-encoded again.
 */
export function okxAppLink(link: string): string | null {
  if (!link.startsWith('https://')) return null;
  return `${OKX_UNIVERSAL_LINK}${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(link)}`)}`;
}

const CAST_NOTE = 'The cast commands carry no signer. Add your own, such as --ledger or --account <name>.';
const NO_LINK_NOTE =
  'No signing link: the deployment has no web app URL and none was given. Use the wallet_sendCalls parameters (or the cast commands, when present).';
const NO_CAST_NOTE = "cast commands are omitted: the SDK refused to build them for this deployment's RPC URL";
const RPC_ENV_NOTE =
  "cast commands use $ETH_RPC_URL: set it to your RPC URL (the deployment's URL is not printed because it may contain an API key)";
const ETH_RPC_URL = '"$ETH_RPC_URL"';

/** A URL with anything beyond its origin (a path, a query, userinfo) may carry an API key. */
function hasSecretPart(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname !== '/' || u.search !== '' || u.hash !== '' || u.username !== '' || u.password !== '';
  } catch {
    return true;
  }
}

function skippedNotes(plan: TxPlan): string[] {
  return plan.steps.flatMap((s, i) => {
    const sim = s.simulation;
    if (sim.ok !== 'skipped') return [];
    const why =
      sim.reason === 'DEPENDS_ON_PREVIOUS_STEP'
        ? `it depends on step ${i}`
        : `the simulation was skipped (${sim.reason})`;
    return [
      `Step ${i + 1} was not simulated on its own: ${why}; your wallet and the chain will check it when you sign.`,
    ];
  });
}

const isInvalidOptions = (e: unknown) => decodeError(e).code === 'INVALID_OPTIONS';

function handoffOf(atro: AtropyleClient, plan: TxPlan, webUrl: string | undefined): Handoff | null {
  if (plan.steps.length === 0) return null;
  const notes: string[] = [];
  let link: string | null = null;
  try {
    link = atro.handoff.link(plan, webUrl);
  } catch (e) {
    // The SDK also reports a bad base URL and a payload too large for a link as INVALID_OPTIONS: those are errors.
    const noWebApp = webUrl === undefined && !atro.deployment.webUrl;
    if (!noWebApp || !isInvalidOptions(e)) throw e;
    notes.push(NO_LINK_NOTE);
  }
  // Always the deployment's RPC, never a --rpc URL. A URL with a path or query may carry an API key and the output
  // goes into a model's context, so cast reads it from Foundry's ETH_RPC_URL instead.
  const rpcUrl = atro.deployment.rpcUrls[0];
  const secret = hasSecretPart(rpcUrl);
  let cast: string[] = [];
  try {
    cast = plan.steps.map((s) => {
      const line = atro.handoff.cast(s);
      return secret ? line.split(rpcUrl).join(ETH_RPC_URL) : line;
    });
    notes.unshift(...(secret ? [CAST_NOTE, RPC_ENV_NOTE] : [CAST_NOTE]));
  } catch (e) {
    if (!isInvalidOptions(e)) throw e;
    notes.push(NO_CAST_NOTE);
  }
  notes.push(...skippedNotes(plan));
  return { link, okxAppLink: link === null ? null : okxAppLink(link), cast, calls: atro.handoff.calls(plan), notes };
}

function toOutput(atro: AtropyleClient, action: ActionName, plan: TxPlan, webUrl: string | undefined): PrepareOutput {
  const index = plan.steps.findIndex((s) => s.simulation.ok === false);
  const failed = index >= 0 ? plan.steps[index] : undefined;
  const blocked =
    failed !== undefined && failed.simulation.ok === false
      ? { step: index, action: failed.action, error: failed.simulation.error }
      : null;
  // The SDK has already merged and deduplicated the warnings of the steps into plan.warnings.
  const { warnings } = plan;
  const n = plan.steps.length;
  let tail: string;
  if (blocked) {
    tail = `Step ${blocked.step + 1} of ${n} (${blocked.action}) fails in simulation with ${blocked.error.code}, so there is nothing to sign.`;
  } else if (n === 0) {
    tail = 'There is nothing to sign.';
  } else {
    tail = `${plural(n, 'transaction')} for ${plan.from} to sign on chain ${plan.chainId}.${
      warnings.length > 0 ? ` Show the user ${plural(warnings.length, 'warning')} first.` : ''
    }`;
  }
  return finish(PrepareOutputSchema, {
    action,
    chainId: plan.chainId,
    from: plan.from,
    vault: plan.vault,
    plan,
    handoff: blocked ? null : handoffOf(atro, plan, webUrl),
    blocked,
    summary: `${plan.summary} ${tail}`,
    warnings,
  });
}

export async function prepareCreateVault(atro: AtropyleClient, input: PrepareCreateVaultInput): Promise<PrepareOutput> {
  const owner = planOwner(input.plan, input.owner);
  const plan = await atro.prepare.createVault(input.plan, {
    owner,
    drill: input.drill,
    feeToken: input.feeToken,
    salt: input.salt as Hex | undefined,
    allowance: input.allowance,
  });
  return toOutput(atro, 'createVault', plan, input.webUrl);
}

export async function prepareAction(atro: AtropyleClient, input: PrepareActionInput): Promise<PrepareOutput> {
  const at = input.at === undefined ? undefined : parseAt(input.at, await latestTimestamp(atro));
  const plan = await atro.vault(input.vault).prepare(input.action, { as: input.as, allowance: input.allowance, at });
  return toOutput(atro, input.action.type, plan, input.webUrl);
}
