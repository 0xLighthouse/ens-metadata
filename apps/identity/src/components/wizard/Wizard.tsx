'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { IntentResponse } from '@/lib/attester-client'
import { EMPTY_DIFF, type RecordDiff } from '@/lib/record-diff'
import { useSchema } from '@/lib/use-schema'
import { formatKeyName } from '@/lib/utils'
import type { IntentConfig } from '@ensmetadata/shared/intent'
import { AlertCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  type AttestationProof,
  ComposeScreen,
  type UnchangedRecord,
} from './ComposeScreen'
import { CreatorBanner } from './CreatorBanner'
import { PreviewScreen } from './PreviewScreen'

type Platform = 'com.x' | 'org.telegram'
const KNOWN_PLATFORMS: readonly Platform[] = ['com.x', 'org.telegram'] as const

function isPlatform(s: string): s is Platform {
  return (KNOWN_PLATFORMS as readonly string[]).includes(s)
}

/**
 * Config resolved from a stored intent. Each field is independent — the
 * creator can request just a proof, just attributes, both, or neither.
 *
 * `class` and `schema` accept multiple values for multi-schema asks. The
 * wizard validates attrs against the union of all schemas but writes only
 * the FIRST class value + schema URI to chain, since ENS text records are
 * single strings and downstream verifiers parse them as such.
 */
interface IncomingConfig {
  prefillName: string | null
  requiredPlatforms: Platform[]
  optionalPlatforms: Platform[]
  platformsRequested: boolean
  requiredAttrs: string[]
  optionalAttrs: string[]
  classValues: string[]
  schemaUris: string[]
}

function adaptIntentConfig(config: IntentConfig): IncomingConfig {
  const requiredPlatforms = config.requiredPlatforms.filter(isPlatform)
  const optionalPlatforms = config.optionalPlatforms.filter(isPlatform)
  return {
    prefillName: config.name,
    requiredPlatforms,
    optionalPlatforms,
    platformsRequested: requiredPlatforms.length + optionalPlatforms.length > 0,
    requiredAttrs: config.required,
    optionalAttrs: config.optional.filter((k: string) => !config.required.includes(k)),
    classValues: config.classValues,
    schemaUris: config.schemaUris,
  }
}

interface CreatorInfo {
  ensName: string
  avatar: string | null
  message: string
}

type Screen = 'compose' | 'preview'

const STORAGE_KEY_PREFIX = 'proofs-wizard-state:'
const storageKeyFor = (intentId: string) => `${STORAGE_KEY_PREFIX}${intentId}`

// Persists everything that makes the flow feel continuous within a single
// intent: draft name/attrs, plus sessionId/nonce so the "confirmed ENS name"
// state survives reloads (notably OAuth round-trips). The session itself may
// be server-side expired by the time it's restored — that's fine because
// every API call in the attestation flow mints a fresh session before use,
// and evictSession is tolerant to 404s. The stored values act purely as
// "user has already confirmed ownership of this name" markers.
// Wallet + social linking are handled by Privy's own storage.
interface PersistedState {
  name: string
  sessionId: string | null
  nonce: string | null
  attrsValues: Record<string, string>
}

function loadPersisted(intentId: string): PersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKeyFor(intentId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (typeof parsed.name !== 'string') return null
    return {
      name: parsed.name,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      nonce: typeof parsed.nonce === 'string' ? parsed.nonce : null,
      attrsValues:
        parsed.attrsValues && typeof parsed.attrsValues === 'object'
          ? (parsed.attrsValues as Record<string, string>)
          : {},
    }
  } catch {
    return null
  }
}

interface WizardProps {
  intentId: string
  intent: IntentResponse
}

export function Wizard({ intentId, intent }: WizardProps) {
  const incomingConfig = useMemo(() => adaptIntentConfig(intent.config), [intent.config])
  const creator = useMemo<CreatorInfo>(
    () => ({
      ensName: intent.creator.ensName,
      avatar: intent.creator.avatar,
      message: intent.config.message,
    }),
    [intent],
  )

  const [hydrated, setHydrated] = useState(false)
  const [screen, setScreen] = useState<Screen>('compose')
  const [name, setName] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [nonce, setNonce] = useState<string | null>(null)
  const [proofs, setProofs] = useState<AttestationProof[]>([])
  const [recordDiff, setRecordDiff] = useState<RecordDiff>(EMPTY_DIFF)
  const [unchangedRecords, setUnchangedRecords] = useState<UnchangedRecord[]>([])
  const [attrsValues, setAttrsValues] = useState<Record<string, string>>({})

  // Schema fetch + validation runs at the wizard root. A broken schema URI
  // compromises the entire submission (we'd write `schema = ipfs://garbage`)
  // so we refuse to start the flow until the schema is valid or absent.
  const {
    schema: resolvedSchema,
    loading: schemaLoading,
    error: schemaError,
  } = useSchema(incomingConfig.schemaUris, [
    ...incomingConfig.requiredAttrs,
    ...incomingConfig.optionalAttrs,
  ])

  // Restore persisted draft for this intent id. The page keys Wizard on id,
  // so this mount-effect runs exactly once per intent.
  useEffect(() => {
    const persisted = loadPersisted(intentId)
    setName(incomingConfig.prefillName ?? persisted?.name ?? '')
    setSessionId(persisted?.sessionId ?? null)
    setNonce(persisted?.nonce ?? null)
    setAttrsValues(persisted?.attrsValues ?? {})
    setHydrated(true)
  }, [intentId, incomingConfig.prefillName])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    window.localStorage.setItem(
      storageKeyFor(intentId),
      JSON.stringify({ name, sessionId, nonce, attrsValues } satisfies PersistedState),
    )
  }, [hydrated, intentId, name, sessionId, nonce, attrsValues])

  // Build a key → display label map once, at the root, so compose and
  // preview show consistent names without duplicating schema logic.
  const keyLabels = useMemo<Record<string, string>>(() => {
    const allKeys = [...incomingConfig.requiredAttrs, ...incomingConfig.optionalAttrs]
    return Object.fromEntries(
      allKeys.map((key) => {
        const title = resolvedSchema?.properties?.[key]?.title
        return [key, title ?? formatKeyName(key)]
      }),
    )
  }, [resolvedSchema, incomingConfig.requiredAttrs, incomingConfig.optionalAttrs])

  if (schemaError) {
    return (
      <div className="mx-auto max-w-3xl w-full">
        <Card>
          <CardHeader>
            <CardTitle>Schema error</CardTitle>
            <CardDescription>
              The link you followed points at a schema document that we couldn&apos;t use, so the
              wizard can&apos;t start. The on-chain <span className="font-mono">schema</span> text
              record would otherwise be written pointing at this URI, so we&apos;re refusing
              up-front rather than letting the submission compromise itself.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-900 dark:text-red-100">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                <div className="flex-1 space-y-2">
                  <div className="font-medium">{schemaError}</div>
                  <div className="text-xs">
                    Schema URI:{' '}
                    <span className="font-mono break-all">
                      {incomingConfig.schemaUris.join(', ')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Talk to whoever sent you the link — the agent or tool generating these URLs probably
              has a typo or a stale schema reference.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!hydrated || schemaLoading) {
    return (
      <div className="mx-auto max-w-3xl w-full">
        <Card>
          <CardHeader>
            <CardTitle>Loading…</CardTitle>
            <CardDescription>
              {schemaLoading ? 'Fetching the schema referenced by this link.' : 'Please wait.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl w-full">
      {creator.message && (
        <CreatorBanner
          ensName={creator.ensName}
          avatar={creator.avatar}
          message={creator.message}
        />
      )}

      {screen === 'compose' && (
        <ComposeScreen
          name={name}
          defaultName={incomingConfig.prefillName ?? undefined}
          sessionId={sessionId}
          nonce={nonce}
          attrsValues={attrsValues}
          requiredAttrs={incomingConfig.requiredAttrs}
          optionalAttrs={incomingConfig.optionalAttrs}
          classValue={incomingConfig.classValues[0]}
          schemaUri={incomingConfig.schemaUris[0]}
          schema={resolvedSchema}
          keyLabels={keyLabels}
          requiredPlatforms={incomingConfig.requiredPlatforms}
          optionalPlatforms={incomingConfig.optionalPlatforms}
          platformsRequested={incomingConfig.platformsRequested}
          onNameChange={setName}
          onSessionChange={(sid, n) => {
            setSessionId(sid)
            setNonce(n)
            if (sid === null) {
              // Session cleared — drop any stale proofs too so they don't
              // get silently carried into the next attestation.
              setProofs([])
            }
          }}
          onAttrsChange={setAttrsValues}
          onAttestation={(nextProofs, nextDiff, nextUnchanged) => {
            setProofs(nextProofs)
            setRecordDiff(nextDiff)
            setUnchangedRecords(nextUnchanged)
            setScreen('preview')
          }}
        />
      )}

      {screen === 'preview' && sessionId && (
        <PreviewScreen
          name={name}
          sessionId={sessionId}
          proofs={proofs}
          recordDiff={recordDiff}
          unchangedRecords={unchangedRecords}
          classValue={incomingConfig.classValues[0]}
          schemaUri={incomingConfig.schemaUris[0]}
          keyLabels={keyLabels}
          onBack={() => setScreen('compose')}
        />
      )}
    </div>
  )
}
