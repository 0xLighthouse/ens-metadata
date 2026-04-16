import type { Address } from 'viem'

// Backend-neutral module that turns an attestation source into a draft
// proof claim. Phase 1 uses Privy's built-in Twitter OAuth linking.
//
// Intentionally named `twitter-proof` (not `privy-twitter`) so a future
// backend swap doesn't leave a misleading filename.

/** Platform identifier for the Twitter proof flow. */
export const TWITTER_PLATFORM = 'com.x'

/**
 * Privy's `user.twitter` shape. The important field is `subject` — the
 * stable `sub` claim from the Twitter-issued JWT.
 */
export interface PrivyTwitterAccount {
  subject: string
  username: string | null
  name: string | null
  profilePictureUrl: string | null
}

/**
 * Draft proof document. Fields match the v1 signed payload shape (minus
 * `iat` which is computed by the attester at signing time).
 */
export interface DraftFullProof {
  claim: {
    p: string
    h: string
    uid: string
    name: string
    addr: Address
  }
}

/**
 * Build a draft proof from a Privy-linked Twitter account. No network
 * calls — we trust Privy to have validated the OAuth flow.
 */
export function buildTwitterProofFromPrivy(args: {
  twitter: PrivyTwitterAccount
  issuerAddress: Address
  ensName: string
}): DraftFullProof {
  const { twitter, issuerAddress, ensName } = args

  if (!twitter.subject) {
    throw new Error('Privy Twitter account is missing a subject (stable user id).')
  }
  if (!twitter.username) {
    throw new Error('Privy Twitter account is missing a username (handle).')
  }

  return {
    claim: {
      p: TWITTER_PLATFORM,
      h: twitter.username,
      uid: twitter.subject,
      name: ensName,
      addr: issuerAddress,
    },
  }
}
