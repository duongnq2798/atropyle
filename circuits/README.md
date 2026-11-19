# @atropyle/circuits

The Atropyle policy circuit for [TapeOut](https://tapeout.link) on X Layer, plus the tools that prove it:

- a NetlistVM byte-stream builder (`Netlist`), and the reusable sub-circuits `KofN5` and `Ge4`;
- a 32-lane bitsliced simulator (`compile`, `stepBytes`) with the same semantics as the on-chain `NetlistVM`;
- the reference model (`refStep`) and an exhaustive check of properties P1–P8 over all 2^26 inputs (`verifyPolicy`).

```ts
import { buildAll, verifyPolicy } from '@atropyle/circuits';

const { program } = buildAll();
const report = verifyPolicy(program);
console.log(report.mismatches === 0 && report.violations.every((v) => v === 0));
```

To check the circuit that is live on chain, use `npx atropyle verify` or `verifyPolicy()` from `@atropyle/sdk`.
