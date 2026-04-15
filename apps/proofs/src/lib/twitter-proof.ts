import { CLAIM_VERSION } from '@ensmetadata/sdk'
import type { Address } from 'viem'

// Backend-neutral module that turns an attestation source into a draft
// `full-proof` document (see packages/sdk/schemas/identity-proof.cddl).
//
// Phase 1 uses Privy's built-in Twitter OAuth linking as the attestation
// source: Privy runs the OAuth flow, validates the Twitter-issued JWT, and
// exposes the linked account on `user.twitter`. We trust Privy the same way
// a Phase 2 TLSNotary flow would be trusted — the `method` field on the
// full-proof document disambiguates interpretation for verifiers.
//
// Intentionally named `twitter-proof` (not `privy-twitter`) so a future
// backend swap doesn't leave a misleading filename. Phase 2 can add
// sibling builders (e.g. TLSNotary) behind a discriminated union without
// renaming this file.

/** Platform identifier for the Twitter proof flow. */
export const TWITTER_PLATFORM = 'twitter'

/** Attestation backend identifier stamped into the full-proof document. */
export const PRIVY_METHOD = 'privy-linked'

/**
 * Privy's `user.twitter` shape. Mirrors the `Twitter` interface exported
 * internally by `@privy-io/react-auth`; redefined here because that type
 * is not part of the public surface (it's referenced indirectly via
 * `TwitterOAuthWithMetadata`, which we don't need).
 *
 * The important field is `subject` — the stable `sub` claim from the
 * Twitter-issued JWT. `username` can change at will; `subject` cannot.
 */
export interface PrivyTwitterAccount {
  /** The `sub` claim from the Twitter-issued JWT — stable user id. */
  subject: string
  /** The @handle. Nullable because Privy's type allows it. */
  username: string | null
  /** Display name. Nullable. */
  name: string | null
  /** Profile picture URL. Nullable. */
  profilePictureUrl: string | null
}

/**
 * Minimal snapshot of the Privy-linked Twitter account that gets embedded
 * in the full-proof document under `proof`. We don't dump the entire
 * `user.twitter` object because Privy is trusted — a verifier that
 * re-reads this document only needs to know which account Privy said was
 * linked at attestation time.
 */
export interface PrivyTwitterProofPayload {
  source: 'privy'
  twitter: {
    subject: string
    username: string | null
    name: string | null
  }
}

/**
 * Draft full-proof document matching `full-proof` in
 * `packages/sdk/schemas/identity-proof.cddl`.
 *
 * The inner `claim.prf` (CID) and the outer `sig` are backfilled by
 * ReviewStep after the full-proof is pinned to IPFS and the user signs.
 */
export interface DraftFullProof {
  /** Schema version. */
  v: number
  /** Draft on-chain claim, missing `prf` and `sig` until ReviewStep. */
  claim: {
    v: number
    p: string
    h: string
    uid: string
    exp: number
    prf: string
    name: string
    chainId: number
    addr: Address
  }
  /** Attestation backend. `'privy-linked'` for Phase 1 Privy OAuth. */
  method: typeof PRIVY_METHOD
  /** Issued-at, unix seconds. */
  issuedAt: number
  /** Backend-native attestation payload — the linked Privy account. */
  proof: PrivyTwitterProofPayload
  /** Free-form notes for forensics. */
  notes?: string
}

/**
 * Build a draft full-proof document from a Privy-linked Twitter account.
 *
 * No network calls: we trust Privy to have validated the OAuth flow before
 * exposing the account on `user.twitter`. The caller is responsible for
 * providing the ENS context (`ensName`, `chainId`) and the issuer wallet
 * address — the wallet will sign the claim in ReviewStep.
 *
 * `claim.prf` and the outer `sig` are left blank; ReviewStep pins this
 * document to IPFS, backfills the CID, then hashes and signs.
 */
export function buildTwitterProofFromPrivy(args: {
  twitter: PrivyTwitterAccount
  issuerAddress: Address
  ensName: string
  chainId: number
  nowSeconds?: number
}): DraftFullProof {
  const { twitter, issuerAddress, ensName, chainId } = args
  const nowSeconds = args.nowSeconds ?? Math.floor(Date.now() / 1000)

  if (!twitter.subject) {
    throw new Error('Privy Twitter account is missing a subject (stable user id).')
  }
  if (!twitter.username) {
    throw new Error('Privy Twitter account is missing a username (handle).')
  }

  const NINETY_DAYS = 90 * 24 * 60 * 60

  return {
    v: CLAIM_VERSION,
    claim: {
      v: CLAIM_VERSION,
      p: TWITTER_PLATFORM,
      h: twitter.username,
      uid: twitter.subject,
      exp: nowSeconds + NINETY_DAYS,
      prf: '',
      name: ensName,
      chainId,
      addr: issuerAddress,
    },
    method: PRIVY_METHOD,
    issuedAt: nowSeconds,
    proof: {
      source: 'privy',
      twitter: {
        subject: twitter.subject,
        username: twitter.username,
        name: twitter.name,
      },
    },
    notes: 'privy-linked-accounts',
  }
}
