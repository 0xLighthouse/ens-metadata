import type { Address } from 'viem'

// Sibling of twitter-proof.ts. Same shape, different platform — kept
// duplicated rather than abstracted so a future per-platform divergence
// doesn't have to fight a shared abstraction.

/** Platform identifier for the Telegram proof flow. */
export const TELEGRAM_PLATFORM = 'org.telegram'

/**
 * Privy's `user.telegram` shape. The stable id field is `telegramUserId`.
 */
export interface PrivyTelegramAccount {
  telegramUserId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  photoUrl: string | null
}

/** Draft proof document for a Telegram attestation. */
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
 * Build a draft proof from a Privy-linked Telegram account.
 */
export function buildTelegramProofFromPrivy(args: {
  telegram: PrivyTelegramAccount
  issuerAddress: Address
  ensName: string
}): DraftFullProof {
  const { telegram, issuerAddress, ensName } = args

  if (!telegram.telegramUserId) {
    throw new Error('Privy Telegram account is missing a telegramUserId (stable user id).')
  }
  if (!telegram.username) {
    throw new Error(
      'Privy Telegram account is missing a username — accounts without a public @handle cannot be attested.',
    )
  }

  return {
    claim: {
      p: TELEGRAM_PLATFORM,
      h: telegram.username,
      uid: telegram.telegramUserId,
      name: ensName,
      addr: issuerAddress,
    },
  }
}
