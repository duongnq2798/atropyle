/** Resource atropyle://policy/spec. Keep in sync with §3 of docs/superpowers/specs/2026-11-18-atropyle-design.md. */
export const POLICY_SPEC_MD = `# Atropyle policy v1

The policy is a circuit on an X Layer TapeOut processor. Every lifecycle transition of a vault goes through \`step(policyId, [state], inputs)\`: the circuit returns the next state and three output flags, so it decides every release of the vault's assets. Who receives how much is decided by the vault's Solidity code, not by the circuit. \`npx atropyle verify\` checks the properties P1-P8 below over all 2^26 combinations of state and inputs.

## States (three latches A, R, X)

| Code (X R A) | Byte | Name | Class |
|---|---|---|---|
| 000 | 0x00 | active | Active |
| 001 | 0x01 | grace | Alarm |
| 011 | 0x03 | recovery (RecoveryPending) | Alarm |
| 101 | 0x05 | releasedInherit | Released |
| 111 | 0x07 | releasedRecover | Released |

Codes 010, 100 and 110 are not reachable. X = 1 is treated as Released and kept; 010 is treated as Active.

## Inputs (23 bits)

| Bits | Name | Meaning |
|---|---|---|
| 0-3 | idle | min(15, (now - lastAlive) / period) |
| 4-7 | T | missed periods before the alarm, 1 to 15 |
| 8-12 | inhVotes | bitmap of the guardians who attested death |
| 13-17 | recVotes | bitmap of the guardians who voted for the current recovery candidate, only when recovery is enabled and a recovery candidate is set (not the zero address) |
| 18-20 | k | guardians that must agree (k of n); 0 means the Simple template |
| 21 | alive | the owner signed this transaction |
| 22 | windowDone | an alarm is set and now >= alarmAt + window |

Derived signals:
- inhQ = popcount(inhVotes) >= k, always true when k = 0;
- recQ = k != 0 and popcount(recVotes) >= k;
- late = idle >= T;
- maxed = idle = 15, the fallback when guardians do not answer.

## Transitions, in priority order

1. Released: the state stays the same and every output is 0.
2. alive: back to active.
3. recovery: recQ and windowDone give releasedRecover; recQ keeps recovery; late gives grace; otherwise active.
4. grace: recQ gives recovery; windowDone and (inhQ or maxed) give releasedInherit; otherwise grace.
5. active: recQ gives recovery; late gives grace; otherwise active.

## Outputs

| Bit | Flag | Set when |
|---|---|---|
| 0 | alarm | the new class is Alarm and differs from the old class |
| 1 | cancel | the old class is Alarm and the new state is active |
| 2 | release | the old class is not Released and the new class is Released |

## Properties that verify proves

| # | Property |
|---|---|
| P1 | Released implies the same state and outputs 000 |
| P2 | not Released and alive implies active |
| P3 | when the old state is not Released, becoming releasedInherit implies the old state was grace, not alive, windowDone, not recQ, and (inhQ or maxed) |
| P4 | when the old state is not Released, becoming releasedRecover implies the old state was recovery, not alive, windowDone, recQ and k != 0 |
| P5 | active becomes grace only when late and not alive; active becomes recovery only when recQ and not alive |
| P6 | when the old state is not Released, the next state is one of the five valid codes, so 010, 100 and 110 cannot be reached from active |
| P7 | the three output flags match the Outputs table |
| P8 | (next state, outputs) equals the TypeScript reference model on every combination |

The circuit reuses two public sub-circuits by REF: KofN5 (popcount of 5 votes >= k) and Ge4 (a >= b on 4 bits).
`;
