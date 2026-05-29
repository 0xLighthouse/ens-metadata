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
import { chainFromName } from '@ensmetadata/shared/chain-from-name'
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

/**
 * Upper bound on how many indices we probe per array attribute when
 * pre-loading existing on-chain records (`attr[0]..attr[19]`). Reads are
 * batched, so this just caps the request fan-out; reconstruction stops at the
 * first empty index.
 */
const MAX_ARRAY_PROBE = 20

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
  arrayAttrSet: Set<string>
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
  setAttrsValues: (values: Record<string, string>) => void

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

  const arrayAttrSet = useMemo(() => {
    const set = new Set<string>()
    if (!schema?.arrayProperties) return set
    for (const key of requestedAttrs) {
      if (key in schema.arrayProperties) set.add(key)
    }
    return set
  }, [schema, requestedAttrs])

  // Per-chain attester ENS labels, fetched once from the worker's `GET /`.
  // We pick the right one for the confirmed name below; the map covers
  // every chain the worker advertises.
  const [attesters, setAttesters] = useState<Record<string, string> | null>(null)
  useEffect(() => {
    let cancelled = false
    attesterInfo()
      .then((info) => {
        if (!cancelled) setAttesters(info.attesters)
      })
      .catch(() => {
        // Non-fatal: the wizard still works, existing attestations just won't
        // be recognised in the diff preview.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Resolve once the user has a name to read against. Before that, no
  // attestation keys can be pre-loaded (we don't know which chain's label
  // to use) — the diff preview just shows everything as new.
  const attesterEns = useMemo(() => {
    if (!ens.confirmed || !attesters) return null
    return attesters[chainFromName(ens.ensName).name] ?? null
  }, [ens.confirmed, ens.ensName, attesters])

  const platformList = useMemo(
    () => Array.from(new Set<Platform>([...requiredPlatforms, ...optionalPlatforms])),
    [requiredPlatforms, optionalPlatforms],
  )

  const textRecordKeys = useMemo(() => {
    const keys: string[] = []
    for (const attr of requestedAttrs) {
      if (arrayAttrSet.has(attr)) {
        for (let i = 0; i < MAX_ARRAY_PROBE; i++) keys.push(`${attr}[${i}]`)
      } else {
        keys.push(attr)
      }
    }
    if (classValue) keys.push('class')
    if (schemaUri) keys.push('schema')
    keys.push(...platformList)
    if (attesterEns) {
      for (const p of platformList) {
        keys.push(handleAttestationRecordKey(p, attesterEns))
        keys.push(uidAttestationRecordKey(p, attesterEns))
      }
    }
    return [...new Set(keys)]
  }, [requestedAttrs, arrayAttrSet, classValue, schemaUri, platformList, attesterEns])

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
      if (arrayAttrSet.has(key)) {
        const hasExisting = Object.keys(currentAttrs).some((k) => k.startsWith(`${key}[`))
        if (hasExisting) continue
        for (let i = 0; i < MAX_ARRAY_PROBE; i++) {
          const flatKey = `${key}[${i}]`
          const existing = loadedRecords[flatKey]
          if (typeof existing !== 'string' || !existing) break
          nextValues[flatKey] = existing
          changed = true
        }
      } else {
        const existing = loadedRecords[key]
        if (typeof existing === 'string' && existing && !nextValues[key]) {
          nextValues[key] = existing
          changed = true
        }
      }
    }
    if (changed) setAttrsValues(nextValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedRecords])

  const attestation = useAttestationFlow({
    loadedRecords,
    requestedAttrs,
    arrayAttrSet,
    classValue,
    schemaUri,
    twitter: requestedPlatformSet.has('com.x') ? socials.twitter : null,
    telegram: requestedPlatformSet.has('org.telegram') ? socials.telegram : null,
  })

  const missingRequiredAttrs = useMemo(
    () =>
      requiredAttrs.filter((k) => {
        if (arrayAttrSet.has(k)) {
          return !Object.entries(attrsValues).some(
            ([key, val]) => key.startsWith(`${k}[`) && val.trim().length > 0,
          )
        }
        const v = attrsValues[k]
        return typeof v !== 'string' || v.trim().length === 0
      }),
    [requiredAttrs, attrsValues, arrayAttrSet],
  )

  // Which platforms to show. Required ∪ optional; if neither is specified,
  // fall back to the full catalog (the default "proof-only" flow).
  const visiblePlatforms: Platform[] = useMemo(() => {
    const specified = [...requiredPlatforms, ...optionalPlatforms]
    if (specified.length > 0) return Array.from(new Set(specified))
    return platformsRequested ? [] : ['com.x', 'org.telegram']
  }, [requiredPlatforms, optionalPlatforms, platformsRequested])

  const requiredAccountsLinked = requiredPlatforms.every(socials.isLinked)

  const walletReady = !!walletClient && !!address
  const formReady = attrsLoaded && missingRequiredAttrs.length === 0
  const canCreate =
    ens.confirmed && walletReady && formReady && requiredAccountsLinked && !attestation.isSigning

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
    arrayAttrSet,
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
    setAttrsValues,
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
