# Roles and states

## Roles

| Role            | Who                                         | Can do                                                                                                                                                               |
| --------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner           | The wallet that created the vault           | Check in, change heirs, guardians, timing and assets, revoke approvals. A check-in cancels an alarm or a recovery                                                    |
| Heir            | Up to 5 wallets with a share                | Receives the share when the vault releases to the heirs                                                                                                              |
| Guardian        | Up to 5 wallets the owner trusts            | Attests a death or withdraws it; votes for recovery or withdraws the vote, when recovery is on                                                                       |
| Recovery target | The new wallet that `k` guardians voted for | Receives everything when the vault releases by recovery                                                                                                              |
| Anyone          | Any wallet                                  | Sends `poke` to record a state change the policy already allows, and `distribute` after a release. Signed by the owner before a release, both are a check-in instead |

One wallet can hold several roles. `atropyle status <vault> --as <wallet>` lists them.

## States

| State             | Meaning                                     | What happens next                                                                                                                                                               |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `active`          | The owner checks in on time                 | After the threshold of missed check-ins, the alarm can go off (`grace`)                                                                                                         |
| `grace`           | The alarm went off                          | The owner can cancel by checking in until `windowEndsAt`. After that, the vault releases to the heirs if `k` guardians attested, or once the owner has been idle for 15 periods |
| `recovery`        | `k` guardians voted for the same new wallet | The owner can cancel by checking in until `windowEndsAt`. After that, the vault releases to the new wallet                                                                      |
| `releasedInherit` | Released to the heirs                       | `distribute` pays the heirs; nothing else changes                                                                                                                               |
| `releasedRecover` | Released to the new wallet                  | `distribute` pays the new wallet; nothing else changes                                                                                                                          |

`atropyle verify` proves over every possible input that the vault cannot release in any other way.
