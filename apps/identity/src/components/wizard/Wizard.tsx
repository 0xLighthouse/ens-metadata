'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getIntent } from '@/lib/attester-client'
import { EMPTY_DIFF, type RecordDiff } from '@/lib/record-diff'
import type { DraftFullProof as DraftTelegramProof } from '@/lib/telegram-proof'
import type { DraftFullProof as DraftTwitterProof } from '@/lib/twitter-proof'
import { useSchema } from '@/lib/use-schema'
import { formatKeyName } from '@/lib/utils'
import type { IntentConfig } from '@ensmetadata/shared/intent'
import { AlertCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ConnectWalletStep } from './ConnectWalletStep'
import { CreatorBanner } from './CreatorBanner'
import { type AttestationProof, LinkAccountsStep } from './LinkAccountsStep'
import { EnterAttributesStep } from './EnterAttributesStep'
import { ReviewStep } from './ReviewStep'
import { WizardStepIndicator } from './WizardStepIndicator'

// The two draft types are structurally similar (same inner claim shape,
// different `proof` payload). ReviewStep only reads the inner claim, so
// the union is enough — it doesn't need to discriminate the proof field.
export type AnyDraftFullProof = DraftTwitterProof | DraftTelegramProof

type Platform = 'com.x' | 'org.telegram'
const KNOWN_PLATFORMS: readonly Platform[] = ['com.x', 'org.telegram'] as const

function isPlatform(s: string): s is Platform {
  return (KNOWN_PLATFORMS as readonly string[]).includes(s)
}

/**
 * Config resolved from a stored intent. Each field is independent — the
 * creator can request just a proof, just attributes, both, or neither
 * (in which case the wizard runs its default proof-only flow).
 *
 * `class` and `schema` accept multiple values for multi-schema asks. The
 * wizard validates attrs against the union of all schemas but writes only
 * the FIRST class value + schema URI to chain, since ENS text records are
 * single strings and downstream verifiers parse them as such.
 */
interface IncomingConfig {
  prefillName: string | null
  /** Platforms the recipient MUST link before they can continue. */
  requiredPlatforms: Platform[]
  /** Platforms shown as linkable but skippable. */
  optionalPlatforms: Platform[]
  /** Whether the URL specified `platforms` at all (vs. left it open). */
  platformsRequested: boolean
  /** Text record keys the recipient MUST fill in (Continue is gated on these). */
  requiredAttrs: string[]
  /** Text record keys surfaced as form inputs but OK to leave blank. */
  optionalAttrs: string[]
  /** Offered `class` text record values. First is the primary (written). */
  classValues: string[]
  /** Offered `schema` text record URIs. First is the primary (written). */
  schemaUris: string[]
}

// SSR-safe default. First server render + first client render both use
// this; the real intent-derived config is populated in an effect on the
// client to avoid a hydration mismatch in the step indicator.
const DEFAULT_CONFIG: IncomingConfig = {
  prefillName: null,
  requiredPlatforms: [],
  optionalPlatforms: [],
  platformsRequested: false,
  requiredAttrs: [],
  optionalAttrs: [],
  classValues: [],
  schemaUris: [],
}

// Translate a stored IntentConfig (fully resolved at creation) into the
// shape the wizard already expects. Keeping the projection narrow means
// all existing step code keeps reading the same `IncomingConfig` interface.
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

// A wizard step is a named kind, not a number. The list of steps is
// computed from the incoming config so the indicator and the routing
// stay in sync without an off-by-one foot-gun.
type StepKind = 'wallet' | 'social' | 'attrs' | 'review'

interface StepEntry {
  kind: StepKind
  label: string
}

function computeSteps(config: IncomingConfig): StepEntry[] {
  const steps: StepEntry[] = [{ kind: 'wallet', label: 'Connect wallet' }]

  // Show the social step if the URL explicitly asks for platforms OR if
  // nothing specific was asked (the default proof-only flow).
  const totalAttrs = config.requiredAttrs.length + config.optionalAttrs.length
  const wantsSocial =
    config.platformsRequested ||
    (totalAttrs === 0 && config.classValues.length === 0 && config.schemaUris.length === 0)
  if (wantsSocial) {
    steps.push({ kind: 'social', label: 'Link accounts' })
  }

  // Show the attributes step only when there are fields for the user to fill in.
  // class/schema-only writes skip this step and go directly to review.
  const wantsAttrs = totalAttrs > 0
  if (wantsAttrs) {
    steps.push({ kind: 'attrs', label: 'Complete profile' })
  }

  steps.push({ kind: 'review', label: 'Review and publish' })
  return steps
}

const STORAGE_KEY = 'proofs-wizard-state'

interface PersistedState {
  stepIndex: number
  name: string
  sessionId: string | null
  nonce: string | null
  platform: Platform
  proofs: AttestationProof[]
  attrsValues: Record<string, string>
}

function loadPersisted(): PersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (typeof parsed.stepIndex !== 'number' || typeof parsed.name !== 'string') return null
    const proofs: AttestationProof[] = Array.isArray(parsed.proofs) ? parsed.proofs : []
    const stepIndex = proofs.length > 0 ? Math.min(parsed.stepIndex, 2) : Math.min(parsed.stepIndex, 1)
    return {
      stepIndex,
      name: parsed.name,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      nonce: typeof parsed.nonce === 'string' ? parsed.nonce : null,
      platform: isPlatform(parsed.platform) ? parsed.platform : 'com.x',
      proofs,
      attrsValues: parsed.attrsValues && typeof parsed.attrsValues === 'object'
        ? parsed.attrsValues as Record<string, string>
        : {},
    }
  } catch {
    return null
  }
}

interface WizardProps {
  intentId: string
}

export function Wizard({ intentId }: WizardProps) {
  const [hydrated, setHydrated] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [name, setName] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [nonce, setNonce] = useState<string | null>(null)
  const [proofs, setProofs] = useState<AttestationProof[]>([])
  const [recordDiff, setRecordDiff] = useState<RecordDiff>(EMPTY_DIFF)
  const [attrsValues, setAttrsValues] = useState<Record<string, string>>({})

  // The URL-derived config is read on the client only. First render (server
  // + first client pass) uses DEFAULT_CONFIG so the initial HTML matches; the
  // real values land after mount. Gating the render on `hydrated` avoids a
  // flash of the empty-config wizard.
  const [incomingConfig, setIncomingConfig] = useState<IncomingConfig>(DEFAULT_CONFIG)
  const [creator, setCreator] = useState<CreatorInfo | null>(null)
  const [intentError, setIntentError] = useState<string | null>(null)
  const steps = useMemo(() => computeSteps(incomingConfig), [incomingConfig])

  // Schema fetch + validation runs at the wizard root, before any step
  // gets a chance to render. A broken schema URI compromises the entire
  // submission — the wizard would write a `schema = ipfs://...` text
  // record pointing at garbage — so we refuse to start the flow until
  // the schema is either valid or absent.
  const {
    schema: resolvedSchema,
    loading: schemaLoading,
    error: schemaError,
  } = useSchema(incomingConfig.schemaUris, [
    ...incomingConfig.requiredAttrs,
    ...incomingConfig.optionalAttrs,
  ])

  // Default platform: prefer first required, then first optional, then com.x.
  const initialPlatform: Platform =
    incomingConfig.requiredPlatforms[0] ?? incomingConfig.optionalPlatforms[0] ?? 'com.x'
  const [platform, setPlatform] = useState<Platform>(initialPlatform)

  useEffect(() => {
    let cancelled = false

    const applyConfig = (config: IncomingConfig) => {
      if (cancelled) return
      setIncomingConfig(config)
      const persisted = loadPersisted()
      if (persisted) {
        setStepIndex(persisted.stepIndex)
        if (!config.prefillName) setName(persisted.name)
        else setName(config.prefillName)
        setSessionId(persisted.sessionId)
        setNonce(persisted.nonce)
        if (persisted.proofs.length > 0) setProofs(persisted.proofs)
        if (Object.keys(persisted.attrsValues).length > 0) setAttrsValues(persisted.attrsValues)
        const firstPlatform = config.requiredPlatforms[0] ?? config.optionalPlatforms[0]
        if (firstPlatform) {
          setPlatform(firstPlatform)
        } else {
          setPlatform(persisted.platform)
        }
      } else if (config.prefillName) {
        setName(config.prefillName)
      }
      setHydrated(true)
    }

    getIntent(intentId)
      .then((data) => {
        if (cancelled) return
        setCreator({
          ensName: data.creator.ensName,
          avatar: data.creator.avatar,
          message: data.config.message,
        })
        applyConfig(adaptIntentConfig(data.config))
      })
      .catch((err: Error) => {
        if (cancelled) return
        setIntentError(
          err.message === 'not_found'
            ? 'This intent link is invalid or has been removed.'
            : 'Could not load this intent. Check your connection and retry.',
        )
        setHydrated(true)
      })

    return () => {
      cancelled = true
    }
  }, [intentId])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ stepIndex, name, sessionId, nonce, platform, proofs, attrsValues } satisfies PersistedState),
    )
  }, [hydrated, stepIndex, name, sessionId, nonce, platform, proofs, attrsValues])

  const currentStep = steps[stepIndex]
  const stepLabels = steps.map((s) => s.label)
  const advance = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1))
  const back = () => setStepIndex((i) => Math.max(i - 1, 0))

  // Session expired mid-flow: clear session state and return to step 1 so the
  // user re-validates their ENS name and gets a fresh session.
  const handleSessionExpired = () => {
    setSessionId(null)
    setNonce(null)
    setProofs([])
    setStepIndex(0)
  }

  // When the attrs step is absent, class/schema values bypass EnterAttributesStep
  // and are passed directly to ReviewStep to be written unconditionally.
  const hasAttrsStep = steps.some((s) => s.kind === 'attrs')

  // Build a key → display label map once, at the root, so both the form step
  // and review step show consistent names without duplicating schema logic.
  const keyLabels = useMemo<Record<string, string>>(() => {
    const allKeys = [...incomingConfig.requiredAttrs, ...incomingConfig.optionalAttrs]
    return Object.fromEntries(
      allKeys.map((key) => {
        const title = resolvedSchema?.properties?.[key]?.title
        return [key, title ?? formatKeyName(key)]
      }),
    )
  }, [resolvedSchema, incomingConfig.requiredAttrs, incomingConfig.optionalAttrs])

  // An unresolvable intent id fails fast before any step renders, with the
  // same Card shell used for schema errors so the two error modes look
  // uniform to the recipient.
  if (intentError) {
    return (
      <div className="max-w-xl mx-auto w-full">
        <Card>
          <CardHeader>
            <CardTitle>Intent unavailable</CardTitle>
            <CardDescription>{intentError}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Ask whoever sent you this link to generate a new one from the profile builder.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }


  // Refuse to render any wizard step when the schema is broken. The user
  // can still copy the failing URI to debug, but they can't proceed —
  // this is the schema check the agent's URL template wants the user
  // to bounce off rather than ride to a garbage on-chain write.
  if (schemaError) {
    return (
      <div className="max-w-xl mx-auto w-full">
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
      <div className="max-w-xl mx-auto w-full">
        <Card>
          <CardHeader>
            <CardTitle>Loading…</CardTitle>
            <CardDescription>
              {schemaLoading ? 'Fetching the schema referenced by this link.' : 'Preparing…'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto w-full">
      {creator && (
        <CreatorBanner
          ensName={creator.ensName}
          avatar={creator.avatar}
          message={creator.message}
        />
      )}
      <WizardStepIndicator steps={stepLabels} current={stepIndex} />

      {currentStep?.kind === 'wallet' && (
        <ConnectWalletStep
          defaultName={incomingConfig.prefillName ?? (name || undefined)}
          onComplete={(n, sid, nonceVal) => {
            setName(n)
            setSessionId(sid)
            setNonce(nonceVal)
            advance()
          }}
        />
      )}

      {currentStep?.kind === 'social' && sessionId && nonce && (
        <LinkAccountsStep
          name={name}
          sessionId={sessionId}
          nonce={nonce}
          requiredPlatforms={incomingConfig.requiredPlatforms}
          optionalPlatforms={incomingConfig.optionalPlatforms}
          platformsRequested={incomingConfig.platformsRequested}
          initialPlatform={platform}
          onPlatformChange={(p) => setPlatform(p)}
          onBack={back}
          onSessionExpired={handleSessionExpired}
          onComplete={(nextProofs) => {
            setProofs(nextProofs)
            advance()
          }}
        />
      )}

      {currentStep?.kind === 'attrs' && (
        <EnterAttributesStep
          name={name}
          requiredAttrs={incomingConfig.requiredAttrs}
          optionalAttrs={incomingConfig.optionalAttrs}
          classValue={incomingConfig.classValues[0]}
          schemaUri={incomingConfig.schemaUris[0]}
          schema={resolvedSchema}
          keyLabels={keyLabels}
          initialValues={attrsValues}
          onValuesChange={(v) => setAttrsValues(v)}
          onBack={back}
          onComplete={(diff) => {
            setRecordDiff(diff)
            advance()
          }}
        />
      )}

      {currentStep?.kind === 'review' && sessionId && (
        <ReviewStep
          name={name}
          proofs={proofs}
          recordDiff={recordDiff}
          sessionId={sessionId}
          onBack={back}
          classValue={!hasAttrsStep ? incomingConfig.classValues[0] : undefined}
          schemaUri={!hasAttrsStep ? incomingConfig.schemaUris[0] : undefined}
          keyLabels={keyLabels}
        />
      )}
    </div>
  )
}
