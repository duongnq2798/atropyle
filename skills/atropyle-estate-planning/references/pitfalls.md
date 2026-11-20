# Pitfalls to raise with the owner

## Approvals and coverage

The tokens stay in the owner's wallet. When the vault pays the heirs, it can take only what the owner approved to it. `prepare create-vault` adds the approvals; `--allowance exact` approves the current balance and `--allowance unlimited` covers tokens that arrive later. A warning `COVERAGE_BELOW_100` in `status` means part of an asset is not covered. Spending or moving tokens never needs the vault. `prepare revoke-all` removes every approval.

## Heirs that are contracts

`plan check` lists heirs that are contracts in `contractHeirs`. A multisig is fine if the heir controls it. An exchange deposit address is not: the exchange may never credit tokens sent by a contract. Some contracts cannot receive NFTs. Ask for the heir's own wallet.

## A guardian who is also an heir

A guardian who is also an heir gains from confirming a death early. Prefer guardians who inherit nothing, or ask for `k` of at least 2 so that no single heir can push a release.

## Drills

A Drill expires 7 days after it is created and then accepts no more actions. It is for practice. Use real assets in a Drill only in small amounts. The Drill expires on its own; create the real vault with a new plan without `--drill`. After the Drill, `prepare revoke-all <drill vault> --as <owner>` removes its approvals.

## Checking in

The alarm can go off once the owner has missed `threshold` periods in a row. `status` shows that moment in `timeline.milestones.lateAt`. Suggest checking in once per period, with a calendar reminder.

## Death and a lost wallet

Without guardians, only the timer can release the vault, and only to the heirs. Recovery of a lost wallet needs guardians, `k` and `recoveryEnabled: true`. It is off unless the owner asks for it (`--recovery`). The owner can cancel any alarm or recovery by checking in before the window ends.

## Addresses

Read every address back to the user. A typo in an heir address cannot be undone after a release. Mixed-case addresses must have a valid checksum, or the CLI stops with `INVALID_ADDRESS`.

## Fees

Creating a vault costs a fee in one of the fee tokens, shown by `plan check` in `fees`. The first vaults pay an early price (`fees.earlyRemaining`). A Drill is free.
