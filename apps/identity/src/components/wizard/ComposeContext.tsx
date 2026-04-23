'use client'

import { useWeb3 } from '@/contexts/Web3Provider'
import { useAttestationFlow } from '@/hooks/use-attestation-flow'
import { type Platform, useSocialAccounts } from '@/hooks/use-social-accounts'
import { useTextRecords } from '@/hooks/use-text-records'
import { useVerifyEns } from '@/hooks/use-verify-ens'
import { attesterInfo } from '@/lib/attester-client'
import type { FetchedSchema } from '@/lib/schema-resolver'
import { useWizardStore, useWizardStoreApi } from '@/stores/wizard'
import { handleAttestationRecordKey, uidAttestationRecordKey } from '@ensmetadata/sdk'
import type { IntentConfig } from '@ensmetadata/shared/intent'
import { usePrivy } from '@privy-io/react-auth'
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

type Ens = ReturnType<typeof useVerifyEns>
type Socials = ReturnType<typeof useSocialAccounts>
type Attestation = ReturnType<typeof useAttestationFlow>

interface ComposeContextValue {
  // Inputs
  config: IntentConfig
  schema: FetchedSchema | null
  keyLabels: Record<string, string>

  // Hook outputs
  ens: Ens
  socials: Socials
  attestation: Attestation

  // Config-derived
  classValue: string | undefined
  schemaUri: string | undefined
  requiredAttrs: string[]
  optionalAttrs: string[]
  requestedAttrs: string[]
  requiredAttrSet: Set<string>
  requiredPlatforms: Platform[]
  visiblePlatforms: Platform[]

  // Records
  loadedRecords: Record<string, string | null> | null
  loadError: string | null
  attrsLoaded: boolean

  // Validation
  missingRequiredAttrs: string[]
  requiredAccountsLinked: boolean
  canCreate: boolean

  // UI copy
  previewLabel: string

  // Form store
  attrsValues: Record<string, string>
  setAttrValue: (key: string, value: string) => void

  // Privy / web3 pass-throughs used by WalletSection
  authenticated: boolean
  ready: boolean
  isInitialized: boolean
  address: `0x${string}` | undefined
  login: () => void
  logout: () => Promise<void>
}

const ComposeContext = createContext<ComposeContextValue | null>(null)

interface ProviderProps {
  config: IntentConfig
  schema: FetchedSchema | null
  keyLabels: Record<string, string>
  children: ReactNode
}

/**
 * Orchestrates every stateful hook the compose screen needs and exposes the
 * bundle through context. Calling the hooks here (not in sections) means each
 * hook's internal state is shared across all consumers — e.g. `signPhase` is
 * the same value in ActionBar as in WalletSection.
 */
export function ComposeProvider({ config, schema, keyLabels, children }: ProviderProps) {
  const {
    required: requiredAttrs,
    optional: optionalAttrs,
    classValues,
    schemaUris,
    requiredPlatforms,
    optionalPlatforms,
  } = config
  const classValue = classValues[0]
  const schemaUri = schemaUris[0]
  const platformsRequested = requiredPlatforms.length + optionalPlatforms.length > 0

  const { login, logout, authenticated, user, ready } = usePrivy()
  const { walletClient, isInitialized } = useWeb3()
  const address = user?.wallet?.address as `0x${string}` | undefined

  const attrsValues = useWizardStore((s) => s.attrsValues)
  const setAttrValue = useWizardStore((s) => s.setAttrValue)
  const setAttrsValues = useWizardStore((s) => s.setAttrsValues)
  const resetForm = useWizardStore((s) => s.resetForm)
  const storeApi = useWizardStoreApi()

  // Disconnecting the wallet invalidates the ENS name, session, and every
  // form entry tied to the old signer. Track the previous `authenticated`
  // value so we only reset on an actual true→false transition (not on the
  // initial false→false render before Privy finishes hydrating).
  const wasAuthenticatedRef = useRef(authenticated)
  useEffect(() => {
    if (wasAuthenticatedRef.current && !authenticated) {
      resetForm()
    }
    wasAuthenticatedRef.current = authenticated
  }, [authenticated, resetForm])

  const ens = useVerifyEns()
  const socials = useSocialAccounts()

  const requestedAttrs = useMemo(
    () => [...requiredAttrs, ...optionalAttrs],
    [requiredAttrs, optionalAttrs],
  )
  const requestedPlatformSet = useMemo(
    () => new Set<Platform>([...requiredPlatforms, ...optionalPlatforms]),
    [requiredPlatforms, optionalPlatforms],
  )
  const requiredAttrSet = useMemo(() => new Set(requiredAttrs), [requiredAttrs])

  // Attester ENS powers the attestation record keys we need to pre-load so
  // already-published attestations show up as "unchanged" in the diff. Fetched
  // once from the worker's `GET /`.
  const [attesterEns, setAttesterEns] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    attesterInfo()
      .then((info) => {
        if (!cancelled) setAttesterEns(info.attester)
      })
      .catch(() => {
        // Non-fatal: the wizard still works, existing attestations just won't
        // be recognised in the diff preview.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const platformList = useMemo(
    () => Array.from(new Set<Platform>([...requiredPlatforms, ...optionalPlatforms])),
    [requiredPlatforms, optionalPlatforms],
  )

  const textRecordKeys = useMemo(() => {
    const keys = [...requestedAttrs]
    if (classValue) keys.push('class')
    if (schemaUri) keys.push('schema')
    // Platform IDs (e.g. `com.x`) double as the plain-handle record keys.
    // Load them so the publish diff can skip records that already match.
    keys.push(...platformList)
    if (attesterEns) {
      for (const p of platformList) {
        keys.push(handleAttestationRecordKey(p, attesterEns))
        keys.push(uidAttestationRecordKey(p, attesterEns))
      }
    }
    return [...new Set(keys)]
  }, [requestedAttrs, classValue, schemaUri, platformList, attesterEns])

  const {
    records: loadedRecords,
    error: loadError,
    loaded: attrsLoaded,
  } = useTextRecords(ens.confirmed ? ens.ensName : null, textRecordKeys)

  // Pre-fill any empty attribute inputs with whatever's already on chain, so
  // the publish-time diff treats untouched fields as "keep" instead of "remove".
  // One-shot per records load; we read attrsValues imperatively so typing
  // doesn't retrigger the effect.
  useEffect(() => {
    if (!loadedRecords) return
    const currentAttrs = storeApi.getState().attrsValues
    const nextValues = { ...currentAttrs }
    let changed = false
    for (const key of requestedAttrs) {
      const existing = loadedRecords[key]
      if (typeof existing === 'string' && existing && !nextValues[key]) {
        nextValues[key] = existing
        changed = true
      }
    }
    if (changed) setAttrsValues(nextValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedRecords])

  const attestation = useAttestationFlow({
    loadedRecords,
    requestedAttrs,
    classValue,
    schemaUri,
    twitter: requestedPlatformSet.has('com.x') ? socials.twitter : null,
    telegram: requestedPlatformSet.has('org.telegram') ? socials.telegram : null,
  })

  const missingRequiredAttrs = useMemo(
    () =>
      requiredAttrs.filter((k) => {
        const v = attrsValues[k]
        return typeof v !== 'string' || v.trim().length === 0
      }),
    [requiredAttrs, attrsValues],
  )

  // Which platforms to show. Required ∪ optional; if neither is specified,
  // fall back to the full catalog (the default "proof-only" flow).
  const visiblePlatforms: Platform[] = useMemo(() => {
    const specified = [...requiredPlatforms, ...optionalPlatforms]
    if (specified.length > 0) return Array.from(new Set(specified))
    return platformsRequested ? [] : ['com.x', 'org.telegram']
  }, [requiredPlatforms, optionalPlatforms, platformsRequested])

  const requiredAccountsLinked = requiredPlatforms.every(socials.isLinked)

  const canCreate =
    ens.confirmed &&
    !!walletClient &&
    !!address &&
    missingRequiredAttrs.length === 0 &&
    requiredAccountsLinked &&
    attrsLoaded &&
    !attestation.isSigning

  const previewLabel = (() => {
    switch (attestation.signPhase) {
      case 'awaiting-siwe':
        return 'Waiting for signature…'
      case 'binding':
        return 'Linking accounts…'
      case 'attesting':
        return 'Generating attestation…'
      default:
        return socials.hasLinkedAccount
          ? 'Prepare attestation and preview changes'
          : 'Preview changes'
    }
  })()

  const value: ComposeContextValue = {
    config,
    schema,
    keyLabels,
    ens,
    socials,
    attestation,
    classValue,
    schemaUri,
    requiredAttrs,
    optionalAttrs,
    requestedAttrs,
    requiredAttrSet,
    requiredPlatforms: [...requiredPlatforms],
    visiblePlatforms,
    loadedRecords,
    loadError,
    attrsLoaded,
    missingRequiredAttrs,
    requiredAccountsLinked,
    canCreate,
    previewLabel,
    attrsValues,
    setAttrValue,
    authenticated,
    ready,
    isInitialized,
    address,
    login,
    logout,
  }

  return <ComposeContext.Provider value={value}>{children}</ComposeContext.Provider>
}

export function useCompose(): ComposeContextValue {
  const ctx = useContext(ComposeContext)
  if (!ctx) throw new Error('useCompose must be used inside <ComposeProvider>')
  return ctx
}
