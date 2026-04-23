import type { DraftFullProof as DraftTelegramProof } from '@/lib/telegram-proof'
import type { DraftFullProof as DraftTwitterProof } from '@/lib/twitter-proof'

/**
 * A single attester response entry per platform binding, containing the
 * draft (for display) and the pre-built text-record keys + values for both
 * the handle attestation and the uid attestation.
 */
export interface AttestationProof {
  draft: DraftTwitterProof | DraftTelegramProof
  attester: string
  records: {
    handleKey: string
    handleHex: string
    uidKey: string
    uidHex: string
  }
}

/** Schema-declared attributes whose on-chain value already matches the
 *  submission — not part of the publish diff, but rendered in the preview's
 *  clean view so the user sees their full post-publish profile. */
export interface UnchangedRecord {
  key: string
  value: string
}
