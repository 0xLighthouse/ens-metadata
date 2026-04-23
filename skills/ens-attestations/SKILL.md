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

## Two kinds of attestation

Attestations come in two flavors, each stored in its own text record:

- **Handle attestation** — binds a public handle (`@vitalik`) to the ENS name. Record key: `attestations[<platform>][<attester.eth>]`.
- **UID attestation** — binds a *private* platform uid (OAuth `sub`, Telegram numeric id) to the ENS name. Record key: `uid[<platform>][<attester.eth>]`.

You typically want the UID variant: it's the only one that cryptographically ties the name to the specific user id you already have. The handle record tells you "this handle was claimed"; the uid record tells you "this user is the same one you're talking to."

The `<attester.eth>` segment of the record key is an ENS name (e.g. `atst.lighthousegov.eth`). The SDK resolves that name to an address at verify time — rotating the attester's ENS `addr` record retires the prior signing key and instantly invalidates every signature made with it.

## Setup

```ts
import { addEnsContracts } from '@ensdomains/ensjs'
import { verifyHandleAttestation, verifyUidAttestation } from '@ensmetadata/sdk'
import { http, createPublicClient } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: addEnsContracts(mainnet),
  transport: http(process.env.RPC_URL),
})

// The attester ENS name you trust. The SDK resolves this to the current
// signing address at verify time. Defaults to `atst.lighthousegov.eth`
// if you omit the attester option entirely.
const TRUSTED_ATTESTER = 'atst.lighthousegov.eth'
```

Dependencies: `@ensmetadata/sdk`, `@ensdomains/ensjs`, `viem`, a mainnet RPC URL, and the trusted attester ENS name.

## Verify a uid attestation

```ts
import { verifyUidAttestation } from '@ensmetadata/sdk'

export async function checkTelegram(ensName: string, knownTelegramUid: string) {
  const result = await verifyUidAttestation(
    client,
    { maxAge: 90 * 24 * 60 * 60 }, // optional staleness threshold
    {
      name: ensName,
      platform: 'org.telegram',
      attester: TRUSTED_ATTESTER,
      uid: knownTelegramUid,
    },
  )
  if (!result.valid) return { ok: false as const, reason: result.reason }
  return {
    ok: true as const,
    uid: result.uid,
    issuedAt: result.issuedAt, // unix seconds
  }
}
```

Same shape for X — pass `platform: 'com.x'` and the X OAuth `sub` claim as the known uid.

## Verify a handle attestation

```ts
import { verifyHandleAttestation } from '@ensmetadata/sdk'

const result = await verifyHandleAttestation(
  client,
  { maxAge: 90 * 24 * 60 * 60 },
  { name: 'alice.eth', platform: 'com.x', attester: TRUSTED_ATTESTER },
)
// result.handle is the handle that was attested (also the current value of
// the plain `com.x` text record — they must match for verification to pass).
```

### What each call does under the hood

Both `verifyHandleAttestation` and `verifyUidAttestation`:

1. Read the envelope from the parameterized record (`attestations[<p>][<attester.eth>]` or `uid[<p>][<attester.eth>]`).
2. Resolve the current ENS owner of the name being verified.
3. Resolve the attester's ENS name to its current address (the signing key).
4. Read auxiliary context: for a handle attestation, read the plain `<platform>` text record; for a uid attestation, the raw uid you passed.
5. Reconstruct the canonical DAG-CBOR payload from those values plus the envelope timestamp.
6. `keccak256(payload)`, `ecrecover` against the signature, compare to the attester's resolved address.
7. Apply freshness threshold if configured.

### Failure reasons

| Reason | What it means | What to do |
| --- | --- | --- |
| `missing` | No record under the parameterized key, or (for handle attestations) no `<platform>` text record. | Send the user a wizard link; poll. |
| `decode-error` | Record bytes don't parse as a v2 envelope. | Treat as adversarial or corrupted. |
| `unsupported-version` | Envelope version isn't v2. | Upgrade the SDK. |
| `attester-not-resolved` | The attester ENS name has no current `addr` record — nothing under that name is verifiable until the ENS is fixed. | Inspect your `attester` option; if it's correct, the attester's operator has not pointed the name at a signing key. |
| `bad-signature` | Reconstructed payload doesn't match the signature — could be wrong owner (name transferred), wrong handle/uid supplied, a rotated key, or a different attester entirely. | Check you passed the right attester name; confirm the user hasn't transferred the name. |
| `stale` | `now - issuedAt > maxAge`. | Only fires if you set `maxAge`. Ask the user to re-issue. |

`result.recovered` (when present) holds the address ecrecover returned; if it's a valid-looking address but not your trusted attester, a different attester signed this or the payload reconstruction was wrong.

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
```

These records are **self-asserted** — the user wrote them, no attester involved. Treat them as hints, not evidence.

## Attestation format

Attestations are stored as hex-encoded CBOR in parameterized ENS text records:

```
alice.eth
  ├── com.x                                                  = "alice"           # plain handle
  ├── attestations[com.x][atst.lighthousegov.eth]            = "0xda61747374…"   # handle attestation
  ├── uid[com.x][atst.lighthousegov.eth]                     = "0xda61747374…"   # uid attestation
  ├── org.telegram                                           = "alice"
  ├── attestations[org.telegram][atst.lighthousegov.eth]     = "0xda61747374…"
  └── uid[org.telegram][atst.lighthousegov.eth]              = "0xda61747374…"
```

Each value starts with `0xDA` (CBOR tag header) followed by tag `1635021684` (`0x61747374`, ASCII for `atst`). The attester's **ENS name** is in the record key; the SDK resolves it to an address at verify time.

### Envelope (v2)

```
Tag(1635021684) [
  2,             // envelope version
  <uint>,        // issuedAt, unix seconds (signed)
  <bytes 65>,    // EIP-191 signature over keccak256(dag-cbor(payload))
]
```

### Payload (DAG-CBOR, reconstructed; NOT stored on chain)

Handle payload:

| CBOR key | Field | Description |
| --- | --- | --- |
| `n` | name | ENS name the attestation is bound to |
| `a` | addr | 20-byte wallet address the attester observed (typically current ENS owner) |
| `p` | platform | Reverse-DNS platform id — `com.x`, `org.telegram` |
| `h` | handle | Handle at time of attestation (matches the `<platform>` text record) |
| `t` | issuedAt | Unix seconds (matches the envelope's issuedAt) |

UID payload:

| CBOR key | Field | Description |
| --- | --- | --- |
| `n` | name | ENS name the attestation is bound to |
| `a` | addr | 20-byte wallet address |
| `p` | platform | Reverse-DNS platform id |
| `u` | uid | Raw private user id (e.g. OAuth `sub`, Telegram numeric id) |
| `t` | issuedAt | Unix seconds |

## Trust model — read this once

There is exactly one cryptographic binding in the system: **the envelope signature over the reconstructed payload**. A valid signature from an attester you trust means the attester saw a user who controlled `payload.addr` at `payload.t` and could log into `payload.platform` as `payload.h` or `payload.u`.

The attester's **ENS name** lives in the record key; the signing address is whatever that name resolves to *right now*. If you're verifying an attestation signed by an attester you don't trust, don't read it in the first place — pick records under `attestations[<p>][<your-trusted-attester-ens>]`.

**Key rotation**: the attester's operator can rotate the signing key simply by updating the `addr` record on its ENS name. Older signatures made with the retired key stop verifying the moment the resolution changes. No blockchain transaction, no special "revocation" step — just an ENS resolver update.

The wallet's only roles are (1) publishing the signed envelope and (2) being the ENS name owner. It does not sign the attestation.

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

After sending the link, **poll** `verifyUidAttestation` or `verifyHandleAttestation` (or `getEnsText` for non-attestation records) until the records land. The wizard takes a few minutes — attester signs, user publishes — so ~30s poll intervals are fine.

## What this skill does NOT cover

- Writing records on behalf of a user. You can't. The user's wallet has to sign the on-chain transaction; the wizard exists precisely because you can't do this for them.
- Internals of the attester service. You don't need to know how it works — just allow-list its address.
- Deploying your own attester. If you need that, see `workers/attester/` in the repo source. Most agents should not run their own attester; reuse a shared one.
