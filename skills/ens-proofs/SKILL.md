---
name: ens-proofs
description: Verify ENS social-account proofs (Twitter / X, Telegram) and read profile attributes from an ENS name using @ensmetadata/sdk. Use when an agent has a user's ENS name and needs to confirm a social-account proof is valid AND bound to a specific platform user id the agent already knows; or when the agent needs to read non-cryptographic profile records (avatar, alias, description, …) from a name; or when the agent wants to ask a human to set up proofs/attributes by sending them a deep link to the proofs wizard.
---

# ENS Metadata Proofs — agent integration

You're an agent with chat context with a user. The user has an ENS name (or you're going to ask for one). You want to verify that a social account they claim is actually bound to that ENS name on chain — and you already know the social account id from the chat platform you're on (e.g. you have the user's Telegram numeric id from the message metadata).

This skill walks you through the four things you need: how to verify, how to read attributes, what the trust model actually is (one paragraph; read it), and how to request setup if the proofs don't exist yet.

## When to use this skill

- You have an ENS name and need to confirm a `com.x.proof` or `org.telegram.proof` is valid AND bound to a known platform user id.
- You want to read non-cryptographic ENS profile records (`avatar`, `alias`, `description`, `email`, `url`, …) from an ENS name.
- You need to ask a human user to *create* proofs or fill in profile records — see the "Requesting setup" section below for how to generate a wizard link.

Don't use this skill for general ENS name resolution (use `viem`'s `getEnsAddress`/`getEnsName` for that), or for writing records on behalf of a user (the user always writes their own records — you can only ask).

## Setup

```ts
import { addEnsContracts } from '@ensdomains/ensjs'
import { verifyProof } from '@ensmetadata/sdk'
import { http, createPublicClient } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: addEnsContracts(mainnet),
  transport: http(process.env.RPC_URL),
})

// Allow-list of attester key addresses you accept. Each deployed
// attester instance has a single signing key whose address is what
// gets stamped into every signed claim's `att` field. Put the
// address(es) you trust here; refuse anything else.
const trustedAttesters = ['0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf']
```

Dependencies: `@ensmetadata/sdk`, `@ensdomains/ensjs`, `viem`, plus a mainnet RPC URL and the trusted attester address(es).

## Verify a single proof

The on-chain `claim.uid` is **blinded** — it's an HMAC-SHA256 digest of the raw platform uid, keyed by the attester's secret. To compare against the uid you know from chat context, call the attester's `/api/blind` endpoint once per user to get the blinded form, then cache it and compare locally going forward.

```ts
import { verifyProof } from '@ensmetadata/sdk'

const ATTESTER_URL = 'https://attester.example.com' // or http://localhost:8787

// Call once per user, cache forever — the output is deterministic.
async function getBlindedUid(platform: string, rawUid: string): Promise<string> {
  const res = await fetch(`${ATTESTER_URL}/api/blind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, uid: rawUid }),
  })
  const json = await res.json() as { blindedUid: string }
  return json.blindedUid
}

export async function checkTelegram(ensName: string, expectedTgUid: string) {
  const result = await verifyProof(
    client,
    { trustedAttesters },
    { name: ensName, platform: 'org.telegram' },
  )
  if (!result.valid) {
    return { ok: false as const, reason: result.reason }
  }
  // Compare the blinded form — NOT the raw uid
  const blindedUid = await getBlindedUid('org.telegram', expectedTgUid)
  if (result.uid !== blindedUid) {
    return { ok: false as const, reason: 'wrong-user' as const }
  }
  return { ok: true as const, handle: result.handle, expiresAt: result.expiresAt }
}
```

Same shape for X — pass `platform: 'com.x'` and the X OAuth `sub` claim as `rawUid`.

The verifier runs four checks in order: (1) signature integrity — `ecrecover(hash, sig) === claim.att`; (2) trust — `claim.att` is in your `trustedAttesters` set; (3) expiry — `claim.exp` is in the future; (4) staleness — the wallet the attester observed (`claim.addr`) is still the current ENS owner. If any of those fails you get a `valid: false` with a `reason` field naming the failure: `missing`, `expired`, `bad-signature`, `untrusted-attester`, `wrong-owner`, `unsupported-version`, `decode-error`, or `handle-changed`.

The uid comparison is **separate** from the SDK's checks — you do it yourself via `/api/blind`, because only you know the raw uid. Without it, anyone can write a valid `org.telegram.proof` linking *some other* Telegram account to their ENS name and the SDK will happily say "valid". The blinded-uid match is the actual binding.

## Read profile attributes

Plain ENS text records — no signature involved, no SDK needed. viem's built-in works:

```ts
import { getEnsText } from 'viem/actions'

const avatar = await getEnsText(client, { name: 'alice.eth', key: 'avatar' })
const alias = await getEnsText(client, { name: 'alice.eth', key: 'alias' })
```

Or batch via ensjs:

```ts
import { getRecords } from '@ensdomains/ensjs/public'

const records = await getRecords(client, {
  name: 'alice.eth',
  texts: ['avatar', 'alias', 'description', 'email', 'class', 'schema'],
})
// records.texts is an array of { key, value } pairs
```

These records are **self-asserted** — the user wrote them, no attester involved. Treat them as hints, not evidence. If you need cryptographic confidence about an attribute, don't use a text record for it; use a proof.

## Trust model — read this once

There is exactly one cryptographic binding in the proof system: **`claim.uid`** in the signed CBOR claim. That field contains a **blinded** form of the platform's stable user id — `HMAC-SHA256(attesterKey, "platform:rawUid")`. An on-chain observer can't recover the raw uid without the attester key, which prevents bulk deanonymisation of social accounts from the chain.

Your job as a verifier is to get the blinded form of the uid you know (via `POST /api/blind { platform, uid }` on the attester) and compare it to `result.uid`. That comparison IS the trust check. Cache the blinded uid the first time you compute it — it's deterministic for a given attester key, platform, and raw uid.

Things that are **not** load-bearing:
- `claim.h` (the handle). Display only. Stored in the clear because handles are already public on the platform. May be stale.
- `claim.addr` (the wallet the attester observed). Used internally for the staleness check; not for identity.
- Anything in the IPFS proof document (`claim.prf` resolves there). Used for forensic investigation, not for cheap-path verification. The raw uid MAY appear in the IPFS doc for deep-path use.

The signer of the on-chain claim is the **attester service**, not the wallet. The wallet's only role is publishing the signed claim to the resolver. Verifiers must allow-list the attester address(es) they accept; `claim.att` is the field to allow-list against.

## Requesting setup

If the proof you wanted is missing, or if you want the user to fill in profile records, generate a wizard URL and send it via whatever channel you have with the user (Telegram chat, DM, email, etc.). The wizard reads its config from query params:

| Param | Format | Purpose |
| --- | --- | --- |
| `name` | ENS name | Pre-fill the name input on step 0 |
| `platforms` | csv of platform ids (`com.x`, `org.telegram`) | Restrict the platform tab picker; single platform → auto-selected |
| `attrs` | csv of text record keys | Surface a form step with one input per attr |
| `class` | string (`Person`, `Agent`, `Organization`) | Pre-set the `class` text record (hidden, written automatically) |
| `schema` | URI (`ipfs://Qm...` or `https://...`) | Pre-set the `schema` text record (same treatment) |

Examples:

```
# Just the Telegram proof — wizard locks the platform picker to Telegram only
https://proofs.example.com/?name=alice.eth&platforms=org.telegram

# Person profile, no proofs
https://proofs.example.com/?name=alice.eth&class=Person&schema=ipfs://QmSHkLh…&attrs=alias,description,avatar

# Both at once — Telegram proof + Person profile, written in one transaction
https://proofs.example.com/?name=alice.eth&platforms=org.telegram&class=Person&schema=ipfs://QmSHkLh…&attrs=alias,avatar
```

After sending the link, **poll** `verifyProof` (or `getEnsText` for non-proof attributes) until the records land. The wizard takes minutes — pin to IPFS, attester signs, ENS write — so polling at ~30s intervals is reasonable. There's no callback or webhook from the wizard back to you; the agent owns its own state machine.

## Failure modes and what they mean

| `result.reason` | What it means | What to do |
| --- | --- | --- |
| `missing` | No `<platform>.proof` text record on this name. | Send the user a wizard link and poll. |
| `expired` | `claim.exp` is in the past. | Send the user a wizard link to re-issue. |
| `bad-signature` | `ecrecover(hash, sig) !== claim.att` — the bytes are corrupt or were tampered with. | Probably can't be fixed by the user; treat as adversarial. |
| `untrusted-attester` | The signature is valid, but `claim.att` isn't in your `trustedAttesters` set. | Either you have the wrong allow-list config, or the proof was issued by an attester you don't accept. Check your config first. |
| `wrong-owner` | The wallet the attester observed at attestation time is no longer the ENS owner. | The name has transferred. The new owner needs to re-issue. |
| `unsupported-version` | `claim.v` is a version this SDK doesn't know. | Upgrade the SDK. |
| `decode-error` | The text record bytes don't decode as a valid CBOR claim. | Same as `bad-signature` — adversarial or corrupted. |
| `handle-changed` (you generate this yourself) | The handle on the proof doesn't match the platform's current handle. | Hint: re-resolve the handle from `uid` on the platform; the proof is still valid, the display string is stale. |
| **uid mismatch (you generate this yourself, not from `result.reason`)** | The SDK said the proof is valid, but `result.uid` doesn't match the user id you knew from your chat context. | A different account is bound to this ENS name. Refuse the binding and re-issue the request. |

## Why polling is fine

The cheap path costs one ENS resolver read — sub-second on a decent RPC. Polling at 30-second intervals while a setup request is outstanding is cheap. Don't use any kind of webhook or callback — there's no infrastructure for it on the proofs side, and the agent's state is simpler when it owns the loop.

## What this skill does NOT cover

- Writing records on behalf of a user. You can't. The user's wallet has to sign the on-chain transaction; the wizard exists precisely because you (the agent) can't do this for them.
- The internals of the attester service. You don't need to know how it works — just allow-list its address.
- Deploying your own attester. If you need that, see `workers/attester/` in the repo source. Most agents should not run their own attester; reuse a shared one.
