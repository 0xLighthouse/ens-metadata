---
name: ens-attestations
description: Verify ENS social-account attestations (X, Telegram) and read profile attributes from an ENS name using @ensmetadata/sdk. Use when an agent has a user's ENS name and needs to confirm a social account is valid AND bound to a specific platform user id the agent already knows; or when the agent needs to read non-cryptographic profile records (avatar, alias, description, …); or when the agent wants to ask a human to set up attestations or fill in profile records by sending them a deep link to the wizard.
---

# ENS Metadata Attestations — agent integration

You're an agent with chat context with a user. The user has an ENS name (or you're about to ask for one). You want to confirm that a social account they claim is actually bound to that ENS name on chain — and you already know the platform user id from the chat platform you're on (e.g. you have the user's Telegram numeric id from the message metadata).

This skill covers the four things you need: how to verify, how to read profile attributes, what the trust model actually is (one paragraph; read it), and how to request setup when the attestation doesn't exist yet.

## When to use this skill

- You have an ENS name and need to confirm a social-account attestation is valid AND bound to a platform user id you already know.
- You want to read non-cryptographic ENS profile records (`avatar`, `alias`, `description`, `email`, `url`, …) from an ENS name.
- You need to ask a human user to *create* an attestation or fill in profile records — see "Requesting setup" below.

Don't use this skill for general ENS name resolution (use viem's `getEnsAddress` / `getEnsName`), or for writing records on behalf of a user — the user always writes their own records via the wizard, you can only ask.

## Setup

```ts
import { addEnsContracts } from '@ensdomains/ensjs'
import { verifyAttestation } from '@ensmetadata/sdk'
import { http, createPublicClient } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: addEnsContracts(mainnet),
  transport: http(process.env.RPC_URL),
})

// Allow-list of attester key addresses you accept. Each deployed attester
// instance has a single signing key whose address is what gets stamped into
// every signed envelope. Put the address(es) you trust here; refuse anything else.
const trustedAttesters = ['0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'] as const
```

Dependencies: `@ensmetadata/sdk`, `@ensdomains/ensjs`, `viem`, a mainnet RPC URL, and the trusted attester address(es).

## Verify an attestation

```ts
import { verifyAttestation } from '@ensmetadata/sdk'
import { keccak256, recoverMessageAddress, toBytes } from 'viem'

export async function checkTelegram(ensName: string, knownTelegramUid: string) {
  const result = await verifyAttestation(
    client,
    { trustedAttesters, maxAge: 90 * 24 * 60 * 60 }, // optional staleness threshold
    { name: ensName, platform: 'org.telegram' },
  )
  if (!result.valid) {
    return { ok: false as const, reason: result.reason }
  }

  // The SDK verified the envelope signature, trust, ownership, and freshness.
  // You still need to verify the uid binding yourself — see below.
  const hash = keccak256(toBytes(`org.telegram:${knownTelegramUid}`))
  const recovered = await recoverMessageAddress({
    message: { raw: hash },
    signature: result.uid as `0x${string}`,
  })
  if (recovered.toLowerCase() !== trustedAttesters[0].toLowerCase()) {
    return { ok: false as const, reason: 'uid-mismatch' as const }
  }

  return {
    ok: true as const,
    handle: result.handle,
    issuedAt: result.issuedAt, // unix seconds
  }
}
```

Same shape for X — pass `platform: 'com.x'` and the X OAuth `sub` claim as the known uid.

### What the SDK check does

`verifyAttestation` reads the text record `social-proofs[<platform>]` on the name, decodes the envelope, and runs these checks:

| Check | Fails with |
| --- | --- |
| The text record exists at all | `missing` |
| Bytes decode as a valid v1 envelope + payload | `decode-error` |
| `envelope.version` is supported | `unsupported-version` |
| `ecrecover(keccak256(payload), sig) === envelope.attester` | `bad-signature` |
| `envelope.attester` is in your trusted-attester set | `untrusted-attester` |
| `payload.addr` equals the current ENS owner | `wrong-owner` |
| `now - payload.issuedAt <= maxAge` (only if `maxAge` set) | `stale` |

There is **no `expired` failure reason and no on-chain expiry field** — staleness is entirely client-side via your chosen `maxAge`. Omit `maxAge` to accept any age.

### The uid binding is your job, not the SDK's

The SDK tells you the envelope is valid and the attester endorsed *some* `platform:uid` pair. It doesn't know which raw uid was signed — that's intentional, because only the attester and the user originally knew it. You, the agent, know the raw uid from your chat platform, so you recompute the hash and `ecrecover` locally:

```ts
const hash = keccak256(toBytes(`${platform}:${rawUid}`))
const recovered = await recoverMessageAddress({
  message: { raw: hash },
  signature: result.uid as `0x${string}`,
})
// recovered should equal the attester address
```

Without this step the binding is not confirmed — anyone could publish a valid envelope linking *some other* account and the SDK would still return `valid: true`.

## Read profile attributes

Plain ENS text records — no signature involved, no SDK needed:

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

These records are **self-asserted** — the user wrote them, no attester involved. Treat them as hints, not evidence. If you need cryptographic confidence about a value, don't use a text record — use an attestation.

## Attestation format

Attestations are stored as hex-encoded CBOR in parameterized ENS text records:

```
alice.eth
  ├── social-proofs[com.x]          = "0xda61747374..."
  └── social-proofs[org.telegram]   = "0xda61747374..."
```

Each value starts with `0xDA` (CBOR tag header) followed by tag `1635021684` (`0x61747374`, ASCII for `atst`). You generally don't touch the bytes directly — `verifyAttestation` handles decoding — but knowing the shape helps when debugging.

### Envelope

```
Tag(1635021684) [
  1,             // envelope version
  <bytes>,       // payload — DAG-CBOR bytes (described below)
  <bytes 20>,    // attester address (unsigned hint; sig is the binding)
  <bytes 65>,    // EIP-191 signature over keccak256(payload)
]
```

### Payload

The signed payload is DAG-CBOR encoded. Field names at the TypeScript layer → CBOR key:

| Field | CBOR key | Description |
| --- | --- | --- |
| `platform` | `p` | Reverse-DNS platform id — `com.x`, `org.telegram`. |
| `handle` | `h` | Social handle at time of attestation. A handle change triggers re-attestation; the `handle-changed` judgment is yours to make (compare `result.handle` to the platform's current handle). |
| `uid` | `u` | Attester-signed hash — `personalSign(keccak256("platform:rawUid"), attesterKey)`. A 65-byte EIP-191 signature, not the raw uid. |
| `name` | `n` | ENS name the attestation is bound to. |
| `issuedAt` | `t` | Unix seconds. |
| `addr` | `a` | The wallet the attester observed during the SIWE session. Used for the ownership check. |

## Trust model — read this once

There is exactly one cryptographic binding in the system: **the envelope signature**. That signature, produced by the attester with its private key, endorses the entire payload — platform, handle, uid, name, issued-at, and observed wallet. A valid envelope signature + an attester you trust means the attester saw a user who controlled `payload.addr` and could log into `payload.platform:rawUid`.

Your verifier job is: (1) let the SDK check envelope integrity, trust, ownership, and freshness; (2) confirm the uid you know matches the signed uid via `ecrecover(keccak256("platform:rawUid"), result.uid) === attesterAddress`. Pure local computation — no attester call, no network dependency.

The signer is the **attester service**, not the wallet. The wallet's only role is publishing the signed envelope to the resolver and being the ENS name owner. Verifiers allow-list the attester address(es) they accept.

## Requesting setup

If the attestation you wanted is `missing`, or you want the user to fill in profile records, generate a wizard URL and send it through whatever channel you have with the user (Telegram DM, email, etc.). The wizard reads query params:

| Param | Format | Purpose |
| --- | --- | --- |
| `name` | ENS name | Pre-fill the name input on step 0. |
| `platforms` | CSV of platform ids (`com.x`, `org.telegram`) | Restrict the platform picker; single platform → auto-selected. |
| `attrs` | CSV of text record keys | Show a form step with one input per attr. |
| `class` | `Person`, `Agent`, `Organization` | Pre-set the `class` text record (hidden, written automatically). |
| `schema` | URI (`ipfs://Qm...` or `https://...`) | Pre-set the `schema` text record (same treatment). |

Examples:

```
# Just the Telegram attestation — wizard locks to Telegram only
https://identity.ensmetadata.app/?name=alice.eth&platforms=org.telegram

# Person profile, no attestations
https://identity.ensmetadata.app/?name=alice.eth&class=Person&schema=ipfs://QmSHkLh…&attrs=alias,description,avatar

# Both at once — Telegram attestation + Person profile, one transaction
https://identity.ensmetadata.app/?name=alice.eth&platforms=org.telegram&class=Person&schema=ipfs://QmSHkLh…&attrs=alias,avatar
```

After sending the link, **poll** `verifyAttestation` (or `getEnsText` for non-attestation records) until the records land. The wizard takes a few minutes — attester signs, user publishes — so ~30s poll intervals are fine. There's no callback or webhook back to you; the agent owns its own state machine.

## Failure modes

SDK-reported reasons (from `result.reason`):

| Reason | What it means | What to do |
| --- | --- | --- |
| `missing` | No `social-proofs[<platform>]` text record on this name. | Send the user a wizard link; poll. |
| `decode-error` | The record bytes don't decode as a v1 envelope + payload. | Treat as adversarial or corrupted. |
| `unsupported-version` | `envelope.version` is a version this SDK doesn't know. | Upgrade the SDK. |
| `bad-signature` | `ecrecover(keccak256(payload), sig) !== envelope.attester`. | Bytes are corrupt or tampered. Treat as adversarial. |
| `untrusted-attester` | Signature is valid, but `envelope.attester` isn't in your trusted set. | Check your allow-list config first; may also mean the attestation was issued by an attester you don't accept. |
| `wrong-owner` | `payload.addr` no longer matches the current ENS owner. | Name has transferred. The new owner needs to re-issue. |
| `stale` | `now - payload.issuedAt > maxAge`. | Only possible if you set `maxAge`. Send the user a wizard link to re-issue. |

Agent-generated (not from `result.reason` — you compute these):

| Reason | What it means | What to do |
| --- | --- | --- |
| `uid-mismatch` | SDK said the envelope is valid, but `recoverMessageAddress` on `result.uid` doesn't match the attester address — a **different** uid was signed. | A different account is bound to this name. Refuse the binding. |
| `handle-changed` | `result.handle` doesn't match the platform's current handle for this uid. | Display hint only — the binding is still valid, the display string is stale. |

## Why polling is fine

The read path costs one ENS resolver call — sub-second on a decent RPC. Polling at 30s intervals while a setup request is outstanding is cheap. Don't wire up webhooks — there's no infrastructure for it on the attester side, and agent state is simpler when it owns the loop.

## What this skill does NOT cover

- Writing records on behalf of a user. You can't. The user's wallet has to sign the on-chain transaction; the wizard exists precisely because you can't do this for them.
- Internals of the attester service. You don't need to know how it works — just allow-list its address.
- Deploying your own attester. If you need that, see `workers/attester/` in the repo source. Most agents should not run their own attester; reuse a shared one.
