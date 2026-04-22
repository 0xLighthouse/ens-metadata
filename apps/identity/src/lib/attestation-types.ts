import type { DraftFullProof as DraftTelegramProof } from '@/lib/telegram-proof'
import type { DraftFullProof as DraftTwitterProof } from '@/lib/twitter-proof'

export interface AttestationProof {
  draft: DraftTwitterProof | DraftTelegramProof
  claimHex: string
}

/** Schema-declared attributes whose on-chain value already matches the
 *  submission — not part of the publish diff, but rendered in the preview's
 *  clean view so the user sees their full post-publish profile. */
export interface UnchangedRecord {
  key: string
  value: string
}
