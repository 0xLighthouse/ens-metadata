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
import { ConnectTelegramStep } from './ConnectTelegramStep'
import { ConnectTwitterStep } from './ConnectTwitterStep'
import { ConnectWalletStep } from './ConnectWalletStep'
import { CreatorBanner } from './CreatorBanner'
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
 * Config decoded from the URL. Each field is independent — agents can
 * request just a proof, just attributes, both, or neither (in which case
 * the wizard runs its default proof-only flow).
 *
 * `class` and `schema` accept comma-joined values for multi-schema asks.
 * The wizard validates attrs against the union of all schemas but writes
 * only the FIRST class value + schema URI to chain, since ENS text records
 * are single strings and downstream verifiers parse them as such.
 */
interface IncomingConfig {
  prefillName: string | null
  /** Allowed platforms for the proof step. Empty = all platforms allowed. */
  allowedPlatforms: Platform[]
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
// this; the real URL-derived config is populated in an effect on the
// client to avoid a hydration mismatch in the step indicator.
const DEFAULT_CONFIG: IncomingConfig = {
  prefillName: null,
  allowedPlatforms: [],
  platformsRequested: false,
  requiredAttrs: [],
  optionalAttrs: [],
  classValues: [],
  schemaUris: [],
}

function parseCsv(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function readIncomingConfig(): IncomingConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG
  const params = new URLSearchParams(window.location.search)
  const platformsRaw = params.get('platforms')
  const allowed = platformsRaw
    ? platformsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(isPlatform)
    : []

  // Preferred wire format: separate required + optional lists. Legacy
  // `?attrs=` is read as "all optional" when the new params aren't present
  // so existing shared links keep working.
  const rawRequired = params.get('required')
  const rawOptional = params.get('optional')
  const legacyAttrs = params.get('attrs')
  const requiredAttrs = parseCsv(rawRequired)
  let optionalAttrs = parseCsv(rawOptional)
  if (!rawRequired && !rawOptional && legacyAttrs) {
    optionalAttrs = parseCsv(legacyAttrs)
  }
  // De-dup: anything in required should not also appear in optional.
  const requiredSet = new Set(requiredAttrs)
  optionalAttrs = optionalAttrs.filter((k) => !requiredSet.has(k))

  return {
    prefillName: params.get('name'),
    allowedPlatforms: allowed,
    platformsRequested: !!platformsRaw,
    requiredAttrs,
    optionalAttrs,
    classValues: parseCsv(params.get('class')),
    schemaUris: parseCsv(params.get('schema')),
  }
}

// Translate a stored IntentConfig (fully resolved at creation) into the
// shape the wizard already expects. Keeping the projection narrow means
// all existing step code keeps reading the same `IncomingConfig` interface.
function adaptIntentConfig(config: IntentConfig): IncomingConfig {
  return {
    prefillName: config.name,
    allowedPlatforms: config.platforms.filter(isPlatform),
    platformsRequested: config.platforms.length > 0,
    requiredAttrs: config.required,
    optionalAttrs: config.optional.filter((k) => !config.required.includes(k)),
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
  platform: Platform
}

function loadPersisted(): PersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (typeof parsed.stepIndex !== 'number' || typeof parsed.name !== 'string') return null
    return {
      // Never resume into the review step — draft is ephemeral and won't exist.
      stepIndex: Math.min(parsed.stepIndex, 1),
      name: parsed.name,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      platform: isPlatform(parsed.platform) ? parsed.platform : 'com.x',
    }
  } catch {
    return null
  }
}

export function Wizard() {
  const [hydrated, setHydrated] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [name, setName] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AnyDraftFullProof | null>(null)
  const [recordDiff, setRecordDiff] = useState<RecordDiff>(EMPTY_DIFF)

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

  // Default platform: first allowed if the URL constrained it, else com.x.
  const initialPlatform: Platform = incomingConfig.allowedPlatforms[0] ?? 'com.x'
  const [platform, setPlatform] = useState<Platform>(initialPlatform)

  useEffect(() => {
    let cancelled = false

    // `applyConfig` is shared between the intent branch and the legacy
    // query-param branch so persistence + initial-state handling stays
    // identical regardless of how the config was delivered.
    const applyConfig = (config: IncomingConfig) => {
      if (cancelled) return
      setIncomingConfig(config)
      const persisted = loadPersisted()
      if (persisted) {
        setStepIndex(persisted.stepIndex)
        if (!config.prefillName) setName(persisted.name)
        else setName(config.prefillName)
        setSessionId(persisted.sessionId)
        if (config.allowedPlatforms.length > 0) {
          setPlatform(config.allowedPlatforms[0])
        } else {
          setPlatform(persisted.platform)
        }
      } else if (config.prefillName) {
        setName(config.prefillName)
      }
      setHydrated(true)
    }

    const params = new URLSearchParams(window.location.search)
    const intentId = params.get('intent')
    if (intentId) {
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
    }

    // Legacy path: pure URL query params, no backend hop.
    applyConfig(readIncomingConfig())
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ stepIndex, name, sessionId, platform } satisfies PersistedState),
    )
  }, [hydrated, stepIndex, name, sessionId, platform])

  const currentStep = steps[stepIndex]
  const stepLabels = steps.map((s) => s.label)
  const advance = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1))
  const back = () => setStepIndex((i) => Math.max(i - 1, 0))

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

  // Visible platforms in the picker — restricted by the URL or all known.
  const visiblePlatforms: Platform[] =
    incomingConfig.allowedPlatforms.length > 0
      ? incomingConfig.allowedPlatforms
      : [...KNOWN_PLATFORMS]
  const showPlatformPicker = visiblePlatforms.length > 1

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
          defaultName={incomingConfig.prefillName ?? undefined}
          onComplete={(n, sid) => {
            setName(n)
            setSessionId(sid)
            advance()
          }}
        />
      )}

      {currentStep?.kind === 'social' && sessionId && (
        <div className="space-y-4">
          {showPlatformPicker && (
            <div className="flex gap-2 max-w-xl mx-auto">
              {visiblePlatforms.includes('com.x') && (
                <button
                  type="button"
                  onClick={() => setPlatform('com.x')}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    platform === 'com.x'
                      ? 'border-neutral-900 bg-neutral-900 text-neutral-50 dark:border-neutral-50 dark:bg-neutral-50 dark:text-neutral-900'
                      : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  X
                </button>
              )}
              {visiblePlatforms.includes('org.telegram') && (
                <button
                  type="button"
                  onClick={() => setPlatform('org.telegram')}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    platform === 'org.telegram'
                      ? 'border-neutral-900 bg-neutral-900 text-neutral-50 dark:border-neutral-50 dark:bg-neutral-50 dark:text-neutral-900'
                      : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  Telegram
                </button>
              )}
            </div>
          )}

          {platform === 'com.x' && (
            <ConnectTwitterStep
              name={name}
              sessionId={sessionId}
              onBack={back}
              onComplete={(next) => {
                setDraft(next)
                advance()
              }}
            />
          )}
          {platform === 'org.telegram' && (
            <ConnectTelegramStep
              name={name}
              sessionId={sessionId}
              onBack={back}
              onComplete={(next) => {
                setDraft(next)
                advance()
              }}
            />
          )}
        </div>
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
          draft={draft}
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
