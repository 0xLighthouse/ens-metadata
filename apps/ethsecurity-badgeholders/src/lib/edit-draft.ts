import { KEEP_ALL_SOCIALS, type ProfileForm, type SocialDrafts } from '@/lib/profile-records'
import { SOCIAL_PLATFORMS, type SocialPlatform } from '@/lib/social'

/**
 * The editor's in-progress state, parked in `sessionStorage` while Privy's social OAuth
 * sends the browser away and back. Keyed by badgeholder address so a draft never leaks
 * onto another profile.
 */
export type EditDraft = {
  form: ProfileForm
  socials: SocialDrafts
  /** The platform whose Connect button started the redirect, resolved on return. */
  pendingLink: SocialPlatform | null
  savedAt: number
}

/** A draft older than this is stale rather than restored. */
export const DRAFT_TTL_MS = 30 * 60 * 1000

export const draftKey = (address: string) => `esb:edit-draft:${address.toLowerCase()}`

export const serializeDraft = (draft: EditDraft): string => JSON.stringify(draft)

const isString = (value: unknown): value is string => typeof value === 'string'

const isSocialDrafts = (value: unknown): value is SocialDrafts =>
  typeof value === 'object' &&
  value !== null &&
  SOCIAL_PLATFORMS.every((platform) => {
    const draft = (value as Record<string, { kind?: unknown } | undefined>)[platform]
    return draft?.kind === 'keep' || draft?.kind === 'link' || draft?.kind === 'remove'
  })

/** Parses a stored draft, or `null` when it is missing, malformed, or older than the TTL. */
export function parseDraft(raw: string | null, now = Date.now()): EditDraft | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<EditDraft> | null
    if (!value || typeof value !== 'object') return null
    const { form, socials, pendingLink, savedAt } = value
    if (typeof savedAt !== 'number' || now - savedAt > DRAFT_TTL_MS) return null
    if (!form || ![form.name, form.description, form.avatar, form.email].every(isString)) {
      return null
    }
    const validPending =
      pendingLink === null || SOCIAL_PLATFORMS.includes(pendingLink as SocialPlatform)
    if (pendingLink === undefined || !validPending) return null
    return {
      form: {
        name: form.name,
        description: form.description,
        avatar: form.avatar,
        email: form.email,
      },
      socials: isSocialDrafts(socials) ? socials : KEEP_ALL_SOCIALS,
      pendingLink: pendingLink as SocialPlatform | null,
      savedAt,
    }
  } catch {
    return null
  }
}

const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function loadEditDraft(address: string): EditDraft | null {
  try {
    return parseDraft(storage()?.getItem(draftKey(address)) ?? null)
  } catch {
    return null
  }
}

export function saveEditDraft(address: string, draft: Omit<EditDraft, 'savedAt'>): void {
  try {
    storage()?.setItem(draftKey(address), serializeDraft({ ...draft, savedAt: Date.now() }))
  } catch {
    // Storage full or blocked: the draft simply will not survive a redirect.
  }
}

export function clearEditDraft(address: string): void {
  try {
    storage()?.removeItem(draftKey(address))
  } catch {
    // Nothing to clear.
  }
}
