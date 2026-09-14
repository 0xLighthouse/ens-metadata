import type { AttestationEntry } from '@/lib/attester-client'
import { PERSON_CLASS, PERSON_SCHEMA_URI } from '@/lib/constants'
import { PERSON_SCHEMA_KEYS } from '@/lib/person-schema'
import {
  LEGACY_TWITTER_KEY,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
  X_PLATFORM,
  attestationKeys,
} from '@/lib/social'
import { isValidEmail } from '@/lib/validation'
import { computeDelta, hasChanges } from '@ensmetadata/sdk/delta'

/**
 * Pure logic behind the profile editor: what the form holds, what is pending for each social
 * platform, and how those become the text records one transaction writes.
 *
 * Record maps follow the SDK's two conventions. A *state* map (`RecordState`) only has keys
 * that are set on-chain. A *changes* map has `''` for "delete this key"; a key that is absent
 * is left alone.
 */

/** Text records currently set on a name, as the SDK reader returns them. */
export type RecordState = Record<string, string>

export const PROFILE_TEXT_KEYS = ['name', 'description', 'avatar', 'email'] as const
export type ProfileTextKey = (typeof PROFILE_TEXT_KEYS)[number]

export type ProfileForm = Record<ProfileTextKey, string>

/**
 * What the editor will do to one platform on save. `link` carries the Privy-linked account
 * that the attester will sign for; `remove` clears the handle and its attestation records.
 */
export type SocialDraft =
  | { kind: 'keep' }
  | { kind: 'link'; handle: string; uid: string }
  | { kind: 'remove' }

export type SocialDrafts = Record<SocialPlatform, SocialDraft>

export const KEEP_ALL_SOCIALS: SocialDrafts = {
  'com.x': { kind: 'keep' },
  'org.telegram': { kind: 'keep' },
}

/**
 * Every key the editor reads that the Person schema does not declare, so a single
 * `getMetadata` call returns the whole picture.
 */
export const PROFILE_EXTRA_KEYS: readonly string[] = [
  'name',
  X_PLATFORM,
  LEGACY_TWITTER_KEY,
  'org.telegram',
  ...SOCIAL_PLATFORMS.flatMap((platform) => {
    const keys = attestationKeys(platform)
    return [keys.handle, keys.uid]
  }),
]

const nonEmpty = (value: string | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** The form as it should open: one input per text record, empty when unset. */
export const formFromRecords = (existing: RecordState): ProfileForm => ({
  name: existing.name ?? '',
  description: existing.description ?? '',
  avatar: existing.avatar ?? '',
  email: existing.email ?? '',
})

/** The handle currently on-chain for `platform`, honouring the legacy X key. */
export const onChainHandle = (existing: RecordState, platform: SocialPlatform): string | null =>
  platform === X_PLATFORM
    ? (nonEmpty(existing[X_PLATFORM]) ?? nonEmpty(existing[LEGACY_TWITTER_KEY]))
    : nonEmpty(existing[platform])

export type FormErrors = Partial<Record<ProfileTextKey, string>>

const AVATAR_URI = /^(https?:\/\/|ipfs:\/\/|eip155:|data:)/i

/** Per-field problems that block saving. An empty object means the form is valid. */
export function validateProfileForm(form: ProfileForm): FormErrors {
  const errors: FormErrors = {}
  const email = form.email.trim()
  if (email && !isValidEmail(email)) errors.email = 'Enter a valid email address.'
  const avatar = form.avatar.trim()
  if (avatar && !AVATAR_URI.test(avatar)) {
    errors.avatar = 'Enter an http(s)://, ipfs://, eip155: or data: URI.'
  }
  return errors
}

/** The text-field part of the desired state, trimmed so whitespace-only input deletes. */
const desiredTextRecords = (form: ProfileForm): Record<string, string> => {
  const desired: Record<string, string> = {}
  for (const key of PROFILE_TEXT_KEYS) desired[key] = form[key].trim()
  return desired
}

/**
 * Whether saving would change anything the user controls. `class` and `schema` are excluded
 * on purpose: they are written on every save but should not make an untouched form dirty.
 */
export const hasPendingChanges = (
  existing: RecordState,
  form: ProfileForm,
  socials: SocialDrafts,
): boolean =>
  hasChanges(existing, desiredTextRecords(form)) ||
  SOCIAL_PLATFORMS.some((platform) => socials[platform].kind !== 'keep')

/**
 * The full desired changes map for one save. Text fields come from the form, `class` and
 * `schema` are always the Person values, and each platform contributes its handle and
 * attestation records (from `attestations`, one entry per `link` draft) or their deletion.
 */
export function buildDesiredRecords(args: {
  form: ProfileForm
  socials: SocialDrafts
  attestations: readonly AttestationEntry[]
}): Record<string, string> {
  const desired: Record<string, string> = {
    ...desiredTextRecords(args.form),
    class: PERSON_CLASS,
    schema: PERSON_SCHEMA_URI,
  }

  for (const platform of SOCIAL_PLATFORMS) {
    const draft = args.socials[platform]
    if (draft.kind === 'link') {
      const entry = args.attestations.find((candidate) => candidate.platform === platform)
      if (!entry) throw new Error(`The attester returned no attestation for ${platform}`)
      desired[platform] = entry.handle
      desired[entry.records.handle.key] = entry.records.handle.hex
      desired[entry.records.uid.key] = entry.records.uid.hex
    } else if (draft.kind === 'remove') {
      const keys = attestationKeys(platform)
      desired[platform] = ''
      desired[keys.handle] = ''
      desired[keys.uid] = ''
      if (platform === X_PLATFORM) desired[LEGACY_TWITTER_KEY] = ''
    }
  }

  return desired
}

export type WriteMap = {
  /** Changes the SDK validates against the Person schema. */
  userRecords: Record<string, string>
  /** Changes outside the schema, merged in after validation. */
  bypassRecords: Record<string, string>
  hasChanges: boolean
}

/**
 * Diffs `desired` against what is on-chain and splits the result by whether the Person schema
 * knows the key. Deletions of keys that are not set drop out here, so a `remove` on a platform
 * with no attestation writes nothing for the attestation keys.
 */
export function splitWriteMap(existing: RecordState, desired: Record<string, string>): WriteMap {
  const delta = computeDelta(existing, desired)
  const write: Record<string, string> = { ...delta.changes }
  for (const key of delta.deleted) write[key] = ''

  const userRecords: Record<string, string> = {}
  const bypassRecords: Record<string, string> = {}
  for (const [key, value] of Object.entries(write)) {
    if (PERSON_SCHEMA_KEYS.has(key)) userRecords[key] = value
    else bypassRecords[key] = value
  }
  return { userRecords, bypassRecords, hasChanges: Object.keys(write).length > 0 }
}

/**
 * The on-chain state as the SDK writer should see it: only Person keys, so the projected
 * state it validates never carries a key the schema rejects.
 */
export const existingForWriter = (existing: RecordState): RecordState =>
  Object.fromEntries(Object.entries(existing).filter(([key]) => PERSON_SCHEMA_KEYS.has(key)))
