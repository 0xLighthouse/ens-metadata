import { CLAIM_VERSION } from '@ensmetadata/sdk'
import type { Address } from 'viem'

// Sibling of twitter-proof.ts. Same shape, different platform — kept
// duplicated rather than abstracted so a future per-platform divergence
// (different evidence shape, different attestation method, different
// expiry policy) doesn't have to fight a shared abstraction.

/** Platform identifier for the Telegram proof flow. */
export const TELEGRAM_PLATFORM = 'org.telegram'

/** Attestation backend identifier stamped into the full-proof document. */
export const PRIVY_METHOD = 'privy-linked'

/**
 * Privy's `user.telegram` shape. Mirrors the `Telegram` interface exported
 * internally by `@privy-io/react-auth` (camelCased version of
 * `ResponseTelegramAccount`); redefined here because the public surface
 * doesn't export the type directly.
 *
 * The stable id field is `telegramUserId`. `username` may be null —
 * Telegram users without a public @username can't be attested because
 * there's no stable handle for verifiers to display.
 */
export interface PrivyTelegramAccount {
  /** Stable Telegram user id. */
  telegramUserId: string
  /** Public @handle. Nullable — not every Telegram user has one. */
  username: string | null
  /** First name. Nullable. */
  firstName: string | null
  /** Last name. Nullable. */
  lastName: string | null
  /** Profile picture URL. Nullable. */
  photoUrl: string | null
}

/**
 * Minimal snapshot of the Privy-linked Telegram account that gets embedded
 * in the full-proof document under `proof`.
 */
export interface PrivyTelegramProofPayload {
  source: 'privy'
  telegram: {
    telegramUserId: string
    username: string | null
    firstName: string | null
    lastName: string | null
  }
}

/**
 * Draft full-proof document for a Telegram attestation. Same overall shape
 * as the Twitter draft — only the `claim.p` value and the `proof` payload
 * differ.
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
  method: typeof PRIVY_METHOD
  issuedAt: number
  proof: PrivyTelegramProofPayload
  notes?: string
}

/**
 * Build a draft full-proof document from a Privy-linked Telegram account.
 *
 * No network calls: we trust Privy to have validated the Telegram login
 * flow before exposing the account on `user.telegram`. ReviewStep pins
 * this document, backfills the resulting reference into `claim.prf`, then
 * asks the attester to sign.
 */
export function buildTelegramProofFromPrivy(args: {
  telegram: PrivyTelegramAccount
  issuerAddress: Address
  ensName: string
  chainId: number
  nowSeconds?: number
}): DraftFullProof {
  const { telegram, issuerAddress, ensName, chainId } = args
  const nowSeconds = args.nowSeconds ?? Math.floor(Date.now() / 1000)

  if (!telegram.telegramUserId) {
    throw new Error('Privy Telegram account is missing a telegramUserId (stable user id).')
  }
  if (!telegram.username) {
    throw new Error(
      'Privy Telegram account is missing a username — accounts without a public @handle cannot be attested.',
    )
  }

  const NINETY_DAYS = 90 * 24 * 60 * 60

  return {
    v: CLAIM_VERSION,
    claim: {
      v: CLAIM_VERSION,
      p: TELEGRAM_PLATFORM,
      h: telegram.username,
      uid: telegram.telegramUserId,
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
      telegram: {
        telegramUserId: telegram.telegramUserId,
        username: telegram.username,
        firstName: telegram.firstName,
        lastName: telegram.lastName,
      },
    },
    notes: 'privy-linked-accounts',
  }
}
