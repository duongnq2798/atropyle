import { ASSET_KINDS, type Asset, type Heir, type Timing, type VaultParams } from './types';

export function heirsToAbi(h: readonly Heir[]) {
  return h.map((x) => ({ account: x.account, bps: x.bps }));
}

export function assetsToAbi(a: readonly Asset[]) {
  return a.map((x) => ({ kind: ASSET_KINDS.indexOf(x.kind), token: x.token, id: x.id, heir: x.heir }));
}

export function timingToAbi(t: Timing) {
  return { period: t.period, threshold: t.threshold, window: t.window };
}

/** VaultParams → the `VaultConfig.Config` tuple expected by createVault. */
export function paramsToAbi(p: VaultParams) {
  return {
    heirs: heirsToAbi(p.heirs),
    guardians: [...p.guardians],
    k: p.k,
    recoveryEnabled: p.recoveryEnabled,
    timing: timingToAbi(p.timing),
    assets: assetsToAbi(p.assets),
  };
}
