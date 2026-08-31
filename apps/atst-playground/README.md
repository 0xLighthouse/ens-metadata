# atst-playground

A scratchpad for the ENS social media account attestation format (ATST). The
spec it follows is served by `apps/atst-landing`; the primitives it calls are
exported from `@ensmetadata/sdk`.

The app has three tabs, and they feed into each other.

**Verify** walks a live mainnet name through Section 7 one step at a time and
shows what each step produced: the resolved manager address, the handle text
record, the decoded envelope, the reconstructed DAG-CBOR payload, its keccak256
digest, the recovered signer, and the attester's expected address. It
deliberately doesn't call the CLI's `verifyHandleAttestation`, because that
returns a verdict and the intermediate values are the point.

**Inspect** takes an envelope apart. Every payload field is editable, because
none of them live in the envelope — the verifier rebuilds them from ENS. Change
the handle by one character and recovery yields an unrelated address, which is
exactly the failure mode Section 8 describes.

**Sign** acts as an attester with a throwaway key generated in the tab. It
produces a v2 envelope and the record key it would be published under, then
hands both to the inspector.

## Running it

```bash
pnpm playground        # from the repo root, serves on :3002
```

Chain reads go through viem's public mainnet endpoint from a route handler, so
there is nothing to configure and no key to hold. Rate limits apply. The app
never writes: publishing an attestation means setting the text record yourself.

## Scope

Issuance in Section 5 requires an OAuth round trip bound to a wallet login,
which lives in `workers/attester` and is out of scope here. The signing tab
covers steps 4 through 8 of issuance only — assembling, encoding, and signing
the payload.
