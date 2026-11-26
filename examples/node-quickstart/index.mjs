#!/usr/bin/env node
// Reads an Atropyle vault, shows what happens if nobody acts, and prepares a check-in.
// It never signs: the owner opens the link in their own wallet.
// Usage: node index.mjs <vault> <owner> [deployment.json]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createAtropyle, parseDeployment } from '@atropyle/sdk';

export async function quickstart({ vault: address, owner, deployment, log = console.log }) {
  const atro = createAtropyle({ chain: deployment ?? 'xlayer' });
  const vault = atro.vault(address);

  const status = await vault.status();
  log(`State: ${status.state}${status.pending === status.state ? '' : ` (due: ${status.pending})`}`);

  const timeline = await vault.timeline();
  for (const e of timeline.events) {
    log(`${new Date(Number(e.at) * 1000).toISOString()}  ${e.kind}: ${e.from} -> ${e.state}`);
  }

  const tx = await vault.prepare({ type: 'checkIn' }, { as: owner });
  log(tx.summary);
  for (const w of tx.warnings) log(`warning ${w.code}: ${w.message}`);
  const failed = tx.steps.find((s) => s.simulation.ok === false);
  if (failed) {
    log(`Nothing to sign: ${failed.action} fails in simulation with ${failed.simulation.error.code}.`);
    return { status, timeline, tx, link: null };
  }
  const link = atro.handoff.link(tx);
  log(`Open this link in your wallet, check the step and sign:\n${link}`);
  return { status, timeline, tx, link };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [vault, owner, file] = process.argv.slice(2);
  if (vault === undefined || owner === undefined) {
    console.log('Usage: node index.mjs <vault> <owner> [deployment.json]');
    console.log('Without a deployment file it reads X Layer mainnet, through the deployment that ships with the SDK.');
    process.exitCode = 2;
  } else {
    const deployment = file === undefined ? undefined : parseDeployment(JSON.parse(readFileSync(file, 'utf8')));
    quickstart({ vault, owner, deployment })
      .then((out) => {
        if (out.link === null) process.exitCode = 1;
      })
      .catch((e) => {
        console.error(e instanceof Error ? e.message : e);
        process.exitCode = 1;
      });
  }
}
