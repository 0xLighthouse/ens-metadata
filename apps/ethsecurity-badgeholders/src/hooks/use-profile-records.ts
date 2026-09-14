'use client'

import { isHandleAttested } from '@/lib/attestation-state'
import { PERSON_SCHEMA } from '@/lib/person-schema'
import { type RecordState, SOCIAL_RECORD_KEYS, onChainHandle } from '@/lib/profile-records'
import { SOCIAL_PLATFORMS, type SocialPlatform, isValidHandle } from '@/lib/social'
import { publicClient } from '@/lib/viem'
import { metadataReader } from '@ensmetadata/sdk'
import { useCallback, useEffect, useState } from 'react'
import type { Address } from 'viem'

/** What is on-chain for one platform: the handle, and whether the trusted attester vouches for it. */
export type OnChainSocial = { handle: string; attested: boolean } | null

export type OnChainSocials = Record<SocialPlatform, OnChainSocial>

export type ProfileRecords =
  | { status: 'idle' | 'loading'; existing: null; socials: null; error: null }
  | { status: 'ready'; existing: RecordState; socials: OnChainSocials; error: null }
  | { status: 'error'; existing: null; socials: null; error: string }

const IDLE: ProfileRecords = { status: 'idle', existing: null, socials: null, error: null }

/**
 * The live text records of `ensName`, read straight from mainnet whenever `enabled` flips to
 * true. The server-rendered row comes from rcrds.xyz and can be an hour stale; the editor
 * needs the truth, including the attestation keys it may have to clear.
 */
export function useProfileRecords(args: {
  ensName: string | null
  owner: Address
  enabled: boolean
}) {
  const { ensName, owner, enabled } = args
  const [state, setState] = useState<ProfileRecords>(IDLE)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled || !ensName) {
      setState(IDLE)
      return
    }
    let cancelled = false
    setState({ status: 'loading', existing: null, socials: null, error: null })

    const load = async () => {
      const reader = metadataReader()(publicClient)
      const { properties } = await reader.getMetadata({
        name: ensName,
        schema: PERSON_SCHEMA,
        keys: [...SOCIAL_RECORD_KEYS],
      })
      const socials = {} as OnChainSocials
      for (const platform of SOCIAL_PLATFORMS) {
        const raw = onChainHandle(properties, platform)
        // Mirror the read path: a malformed handle is treated as unset rather than repaired.
        const handle = raw && isValidHandle(platform, raw) ? raw : null
        socials[platform] = handle
          ? {
              handle,
              attested: await isHandleAttested({
                platform,
                handle,
                ensName,
                owner,
                records: properties,
              }),
            }
          : null
      }
      if (!cancelled) setState({ status: 'ready', existing: properties, socials, error: null })
    }

    load().catch((err: unknown) => {
      if (cancelled) return
      const message = err instanceof Error ? err.message : String(err)
      setState({ status: 'error', existing: null, socials: null, error: message })
    })
    return () => {
      cancelled = true
    }
  }, [enabled, ensName, owner, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { ...state, reload }
}
