import { buildAll, patchRefs } from './policy';

export interface DeployedNetlists {
  kofn5: Uint8Array;
  ge4: Uint8Array;
  policy: Uint8Array;
}

/** Bytes the chain must store once KofN5 = ids[0] and Ge4 = ids[1] are taped out on `cpu`. */
export function deployedNetlists(cpu: string, ids: readonly [bigint, bigint]): DeployedNetlists {
  const b = buildAll();
  return { kofn5: b.kofn.bytes, ge4: b.ge4.bytes, policy: patchRefs(b.policy.bytes, b.policy.refs, cpu, ids) };
}
