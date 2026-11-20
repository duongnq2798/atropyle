# The plan file

`atropyle plan init` writes `atropyle.plan.json`. You can also edit it by hand; `atropyle plan check` reports every problem at once.

## Fields

| Field             | Required       | Meaning                                                                                                                                                          |
| ----------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`         | no             | Always `1`                                                                                                                                                       |
| `owner`           | no             | The owner's wallet. Commands can take `--as <address>` instead                                                                                                   |
| `drill`           | no             | `true` for a Drill, a practice vault that expires 7 days after creation                                                                                          |
| `heirs`           | yes            | 1 to 5 entries `{ "account": "0x…", "percent": 70 }`. Use `bps` (10000 = 100%) instead of `percent` for exact shares. Only a single heir may leave the share out |
| `guardians`       | no             | Up to 5 addresses                                                                                                                                                |
| `k`               | with guardians | How many guardians must agree, from 1 to the number of guardians                                                                                                 |
| `recoveryEnabled` | no             | `true` lets `k` guardians who agree move everything to a wallet they choose, meant for the owner's new wallet. The owner can stop it only by checking in before the window ends. Offer it only if the owner would trust any `k` guardians with everything. Needs guardians. `plan init` leaves it off unless you give `--recovery` |
| `timing`          | yes            | A preset name, or `{ "period": "30d", "threshold": 6, "window": "14d" }`                                                                                         |
| `assets`          | no             | Up to 20 entries `{ "kind": "erc20", "token": "0x…" }`. NFTs add `"id"` and `"heir"`, the index of the heir who receives it, counting from 0                     |

Durations are seconds, or a number with `s`, `m`, `h`, `d` or `w`.

On the command line an asset is written `kind:token[:id][@heir]`, for example `erc721:0x…:42@1`. The `@heir` index counts from 0 too.

## Timing presets

| Preset         | Check-in period | Missed check-ins before the alarm | Time to cancel the alarm |
| -------------- | --------------- | --------------------------------- | ------------------------ |
| `drill`        | 1 minute        | 2                                 | 2 minutes                |
| `sixMonths`    | 30 days         | 6                                 | 14 days                  |
| `twelveMonths` | 30 days         | 12                                | 30 days                  |

## Limits

- Shares add up to exactly 100%. No heir is the owner, and no address appears twice.
- No guardian is the owner.
- The period is at least 1 day and the window at least 3 days, except in a Drill (at least 60 seconds).
- The threshold is from 1 to 15.
- An ERC-20 asset has no non-zero `id`.

## Example

```json
{
  "version": 1,
  "owner": "0x1111111111111111111111111111111111111111",
  "heirs": [
    { "account": "0x2222222222222222222222222222222222222222", "percent": 70 },
    { "account": "0x3333333333333333333333333333333333333333", "percent": 30 }
  ],
  "guardians": [
    "0x4444444444444444444444444444444444444444",
    "0x5555555555555555555555555555555555555555",
    "0x6666666666666666666666666666666666666666"
  ],
  "k": 2,
  "recoveryEnabled": true,
  "timing": "sixMonths",
  "assets": [
    { "kind": "erc20", "token": "0x7777777777777777777777777777777777777777" },
    { "kind": "erc721", "token": "0x8888888888888888888888888888888888888888", "id": "42", "heir": 1 }
  ]
}
```

## Issue codes

`plan init` and `plan check` report each problem as `{ path, code, message }`. The codes include `REQUIRED`, `SHARES_SUM`, `HEIR_IS_OWNER`, `DUPLICATE`, `K_RANGE`, `RECOVERY_NEEDS_K`, `PERIOD_MIN`, `WINDOW_MIN`, `THRESHOLD_RANGE`, `ASSETS_COUNT`, `ERC20_ID_NONZERO`, `ASSET_HEIR_RANGE` and, on chain only, `TOKEN_NOT_CONTRACT`. `prepare create-vault` also refuses the address the vault will get as an heir or a guardian (`HEIR_IS_VAULT`, `GUARDIAN_IS_VAULT`). Fix the field named by `path`.
