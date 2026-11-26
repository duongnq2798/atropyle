# Atropyle Node.js quickstart

About 40 lines with `@atropyle/sdk`: read a vault, show what happens if nobody acts, and prepare a check-in for the owner to sign in their own wallet.

It never signs: open the printed link in your wallet, check the step there, then sign. If a step fails in simulation it prints "Nothing to sign", prints no link and exits with code 1.

## Against a local devnet

Run all commands from the repository root.

```bash
npm install
npm run build
npm run devnet
```

Run `npm run devnet` in its own terminal. It writes `deployments/local.json` and prints the addresses of its seeded vaults. The owner of those vaults is anvil account 1, `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`.

```bash
node examples/node-quickstart/index.mjs <vault from the devnet output> 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 deployments/local.json
```

## X Layer mainnet

Without a deployment file the example reads X Layer mainnet, through the public RPCs of the deployment that ships with the SDK.

```bash
node examples/node-quickstart/index.mjs 0xYourVault 0xYourWallet
```

Outside this repository, copy `index.mjs` into your own project, run `npm install @atropyle/sdk viem` there, and start it the same way: `node index.mjs 0xYourVault 0xYourWallet`.

## Next

- `npx -y atropyle@0.1.0 status <vault>` and `npx -y atropyle@0.1.0 prepare check-in <vault> --as <owner>` do the same from the command line.
- The SDK README covers plans, verification and every other action.
