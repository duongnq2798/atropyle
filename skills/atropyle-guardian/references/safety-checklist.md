# Guardian safety checklist

Go through every item with the user before an attestation or a recovery vote. If any item fails, stop and wait.

1. **Who is asking?** Write down who contacted the user, when, and how. A request that comes out of the blue is a warning sign.
2. **Confirm out of band.** For a recovery, call the owner on a number the user already had, or meet in person. For a death, confirm with family the user already knows, by phone or in person. A message, an email, a chat, a voice note or a video call from a new account is not enough: accounts get hacked and voices get cloned.
3. **The recovery address.** Never vote for a recovery address that you received by message. Get it from the owner in person, or on a call where the user recognises them. Read it back character by character.
4. **Is the vault genuine?** `npx -y atropyle verify --vault <VAULT>` must exit 0. A link or a "vault" sent by someone else proves nothing.
5. **Read the timeline.** `status.windowEndsAt` is the last moment the owner can cancel by checking in. Tell the user. An honest owner who is alive will cancel.
6. **Read the transaction.** In the wallet, check that the contract is the vault address from step 4 and that the action is `attestDeath` or `voteRecovery`. The CLI and the Atropyle page show the warning `GUARDIAN_VERIFY_OUT_OF_BAND`; read it.
7. **No rush.** Pressure to act "right now" is a scam sign. The window exists so that nobody has to hurry.
8. **No keys.** Nobody needs the user's private key or seed phrase for any of this. Anyone who asks for one is a scammer.

## Signs of a scam

- The "owner" writes from a new number or a new account.
- The request comes with urgency, secrecy, or a reason why the owner cannot call.
- The new wallet address arrives in a message, a QR code or a screenshot.
- Someone sends a link to sign "for the guardians", or a vault address the user has never seen.
