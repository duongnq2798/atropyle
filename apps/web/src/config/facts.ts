/*
 * Facts the pages state as hashes, dates or numbers (spec §18, principle 3: no such value is typed by hand twice).
 * test/unit/facts.test.ts ties each one to its source of truth. They are literals: client code never imports
 * deployments/xlayer.json, which would put the whole file into the first load of every page (R16).
 */

/** The keccak of the policy netlist frozen on X Layer: what the proof line shows and /proof/ proves. */
export const POLICY_NETLIST_KECCAK = '0x70167214a030d2024e5b31d7be5f5664e5abad2d7d5323443abed76b776c3864';

/**
 * The day the contracts went live on X Layer mainnet: block 76567034, timestamp 1795336070 = 2026-11-22T08:27:50Z
 * (read from rpc.xlayer.tech on 24 Nov 2026). The test ties it to `factoryBlock`, so a redeploy breaks it.
 */
export const MAINNET_SINCE = '2026-11-22';

/** Seconds between keeper runs: the `atropyle-tick` pg_cron job in supabase/migrations. */
export const KEEPER_CADENCE_S = 60;
