'use server'

import { refreshBadgeholderAvatar } from '@/lib/avatars'
import { BADGEHOLDER_PROFILES_CACHE_TAG } from '@/lib/constants'
import { revalidateTag } from 'next/cache'

const ADDRESS = /^0x[0-9a-f]{40}$/i

/**
 * Drops the cached rcrds.xyz profiles and the one avatar after a badgeholder publishes, so
 * the next render of the profile page re-reads them. rcrds.xyz indexes the chain on its own
 * schedule, so the page can still lag the transaction for a few minutes.
 */
export async function refreshBadgeholderProfile(address: string): Promise<{ ok: true }> {
  if (!ADDRESS.test(address)) throw new Error('Invalid address')
  revalidateTag(BADGEHOLDER_PROFILES_CACHE_TAG)
  refreshBadgeholderAvatar(address)
  return { ok: true }
}
