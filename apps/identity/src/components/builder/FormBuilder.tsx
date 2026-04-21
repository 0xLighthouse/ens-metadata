'use client'

import { CreatorPreviewCard } from '@/components/builder/CreatorPreviewCard'
import { IntentCreator } from '@/components/builder/IntentCreator'
import { GuidedCard, GuidedSection } from '@/components/ui/GuidedCard'
import {
  BUILDER_PLATFORMS,
  BUILDER_SCHEMAS,
  type BuilderPlatformId,
  type BuilderSchema,
} from '@/config/builder-schemas'
import { cn } from '@/lib/utils'
import type { IntentConfig } from '@ensmetadata/shared/intent'
import { Building2, Check, Plus, User, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Form builder. Actor composes an ask — what classes to allow, which
 * fields are required vs optional, which social accounts to attest —
 * then signs an intent. The recipient opens `/<id>` and the wizard
 * loads the config plus the creator's ENS profile.
 *
 * The UI is a guided Q&A: each question soft-unlocks once the prior
 * one has a valid answer. Once unlocked, sections stay accessible so
 * the user can revise non-linearly.
 */

const ALLOWED_SCHEMA_IDS = ['person', 'org'] as const

interface BuilderState {
  /** Empty string = unanswered; forces the user through Q1 before Q2. */
  schemaId: string
  /** Keys the recipient MUST fill in. Subset of chosenOrder. */
  required: string[]
  /** Keys the recipient MAY fill in. Disjoint with required. Union with required = chosenOrder. */
  optional: string[]
  /** Chosen attrs in the order they were added. Drives Q2 chip order so Q3
   *  toggles (required ↔ optional) don't reshuffle Q2. */
  chosenOrder: string[]
  /** Platforms the recipient MUST link. Disjoint with optionalPlatforms. */
  requiredPlatforms: BuilderPlatformId[]
  /** Platforms shown as linkable but skippable. Disjoint with requiredPlatforms. */
  optionalPlatforms: BuilderPlatformId[]
  message: string
}

type PlatformState = 'off' | 'optional' | 'required'

const SCHEMA_ICON: Record<string, typeof User> = {
  person: User,
  org: Building2,
}

function resolveSchema(id: string): BuilderSchema | null {
  return BUILDER_SCHEMAS.find((s) => s.id === id) ?? null
}

function buildConfigFromState(state: BuilderState): IntentConfig | null {
  const schema = resolveSchema(state.schemaId)
  if (!schema) return null
  return {
    version: 1,
    name: null,
    classValues: [schema.classValue],
    schemaUris: [schema.schemaUri],
    required: state.required,
    optional: state.optional,
    requiredPlatforms: state.requiredPlatforms,
    optionalPlatforms: state.optionalPlatforms,
    message: state.message,
  }
}

export function FormBuilder() {
  const [state, setState] = useState<BuilderState>({
    schemaId: '',
    required: [],
    optional: [],
    chosenOrder: [],
    requiredPlatforms: [],
    optionalPlatforms: [],
    message: '',
  })
  // Locked while a shareable link is live, so the user can't silently drift
  // the config away from whatever the link encodes.
  const [linkLocked, setLinkLocked] = useState(false)

  const selectedSchema = useMemo(() => resolveSchema(state.schemaId), [state.schemaId])
  const availableAttrs = selectedSchema?.attrs ?? []
  const buildConfig = useCallback(() => buildConfigFromState(state), [state])

  // Q2's "chosen" is the union of required and optional. Order: requireds first,
  // then optionals — makes chips group visually in Q3 without extra sorting.
  const chosenAttrs = useMemo(
    () =>
      [...state.required, ...state.optional]
        .map((key) => availableAttrs.find((a) => a.key === key))
        .filter((a): a is BuilderSchema['attrs'][number] => !!a),
    [state.required, state.optional, availableAttrs],
  )

  const q1Answered = state.schemaId !== ''
  const q2Answered = chosenAttrs.length > 0
  // Enables the "Get shareable link" button — the intent needs at least one
  // thing for the recipient to do, either attrs or a non-off platform.
  const hasContent =
    state.chosenOrder.length > 0 ||
    state.requiredPlatforms.length > 0 ||
    state.optionalPlatforms.length > 0

  const selectSchema = (id: string) => {
    const target = resolveSchema(id)
    if (!target) return
    setState((s) => {
      if (s.schemaId === target.id) return s
      // Prune any previously-picked attrs that aren't offered by the new
      // schema so the generated URL never carries orphan keys.
      const nextKeys = new Set(target.attrs.map((a) => a.key))
      return {
        ...s,
        schemaId: target.id,
        required: s.required.filter((k) => nextKeys.has(k)),
        optional: s.optional.filter((k) => nextKeys.has(k)),
        chosenOrder: s.chosenOrder.filter((k) => nextKeys.has(k)),
      }
    })
  }

  // Q2: add to chosen (defaults to optional) or remove entirely.
  const toggleAttrChosen = (key: string) =>
    setState((s) => {
      const isChosen = s.required.includes(key) || s.optional.includes(key)
      if (isChosen) {
        return {
          ...s,
          required: s.required.filter((k) => k !== key),
          optional: s.optional.filter((k) => k !== key),
          chosenOrder: s.chosenOrder.filter((k) => k !== key),
        }
      }
      return {
        ...s,
        optional: [...s.optional, key],
        chosenOrder: [...s.chosenOrder, key],
      }
    })

  // Q3: flip an already-chosen attr between required and optional.
  const toggleAttrRequired = (key: string) =>
    setState((s) => {
      if (s.required.includes(key)) {
        return {
          ...s,
          required: s.required.filter((k) => k !== key),
          optional: [...s.optional, key],
        }
      }
      if (s.optional.includes(key)) {
        return {
          ...s,
          required: [...s.required, key],
          optional: s.optional.filter((k) => k !== key),
        }
      }
      return s
    })

  // Q4: three-way platform state, derived from the two arrays.
  const getPlatformState = (id: BuilderPlatformId): PlatformState => {
    if (state.requiredPlatforms.includes(id)) return 'required'
    if (state.optionalPlatforms.includes(id)) return 'optional'
    return 'off'
  }

  const setPlatformState = (id: BuilderPlatformId, next: PlatformState) =>
    setState((s) => {
      const requiredPlatforms = s.requiredPlatforms.filter((p) => p !== id)
      const optionalPlatforms = s.optionalPlatforms.filter((p) => p !== id)
      if (next === 'required') requiredPlatforms.push(id)
      if (next === 'optional') optionalPlatforms.push(id)
      return { ...s, requiredPlatforms, optionalPlatforms }
    })

  const schemaOptions = BUILDER_SCHEMAS.filter((s) =>
    (ALLOWED_SCHEMA_IDS as readonly string[]).includes(s.id),
  )

  const attrChipOptions: ChipOption[] = availableAttrs.map((a) => ({
    id: a.key,
    label: a.label,
    description: a.description,
  }))

  return (
    <div className="space-y-8">
      <CreatorPreviewCard
        message={state.message}
        onMessageChange={(message) => setState((s) => ({ ...s, message }))}
      />

      <div
        className={cn(
          'transition-all duration-200',
          linkLocked && 'pointer-events-none select-none opacity-60 saturate-75',
        )}
        aria-disabled={linkLocked}
      >
      <GuidedCard>
        <GuidedSection
          number="01"
          title="What type of profile do you want to create?"
          description="Pick the kind of entity this profile represents."
          active
        >
          <ProfileTypePicker
            options={schemaOptions}
            value={state.schemaId}
            onChange={selectSchema}
          />
        </GuidedSection>

        <GuidedSection
          number="02"
          title="What would you like to ask about?"
          description="Pick all attributes the user might fill in."
          active={q1Answered}
        >
          <ChipAddField
            options={attrChipOptions}
            selected={state.chosenOrder}
            onToggle={toggleAttrChosen}
            addLabel="Add attribute"
            emptyPopoverCopy={
              availableAttrs.length === 0 ? 'Pick a profile type first.' : undefined
            }
          />
        </GuidedSection>

        <GuidedSection
          number="03"
          title="Which of these are required?"
          description="Users will be required to fill these in before they are allowed to continue."
          active={q1Answered && q2Answered}
        >
          <RequiredToggleField
            attrs={chosenAttrs}
            required={state.required}
            onToggle={toggleAttrRequired}
          />
        </GuidedSection>

        <GuidedSection
          number="04"
          title="Social account linking"
          description="Users can prove ownership of their social media accounts and add an attestation to their profile. For any account marked 'required', the user will not be able to continue until they link their account."
          active={q1Answered}
        >
          <PlatformStateList getState={getPlatformState} onChange={setPlatformState} />
        </GuidedSection>
      </GuidedCard>
      </div>

      <IntentCreator
        buildConfig={buildConfig}
        hasContent={hasContent}
        onGeneratedChange={setLinkLocked}
      />
    </div>
  )
}

// -----------------------------
// Q1 — Profile type (two tap-target cards)
// -----------------------------

function ProfileTypePicker({
  options,
  value,
  onChange,
}: {
  options: BuilderSchema[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((opt) => {
        const Icon = SCHEMA_ICON[opt.id] ?? User
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              'group flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
              active
                ? 'border-rose-500 bg-rose-50/70 ring-1 ring-rose-500/20 dark:border-rose-500/80 dark:bg-rose-950/30'
                : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-900',
            )}
          >
            <span
              className={cn(
                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                active
                  ? 'bg-rose-500 text-white'
                  : 'bg-neutral-100 text-neutral-500 group-hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400',
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {opt.label}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                    active
                      ? 'border-rose-500 bg-rose-500'
                      : 'border-neutral-300 dark:border-neutral-600',
                  )}
                >
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
              </span>
              <span className="mt-0.5 text-xs leading-snug text-neutral-500 dark:text-neutral-400">
                {opt.description}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// -----------------------------
// Q2 — Chip + Add-popover picker
// -----------------------------

interface ChipOption {
  id: string
  label: string
  description?: string
}

function ChipAddField({
  options,
  selected,
  onToggle,
  addLabel,
  emptyPopoverCopy,
}: {
  options: ChipOption[]
  selected: string[]
  onToggle: (id: string) => void
  addLabel: string
  emptyPopoverCopy?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    // Option B: the container is the popover anchor, not the Add button.
    // When chips grow and the Add button shifts to a new row, the popover
    // still opens at the container's top-left and overlays the chip area.
    <div ref={containerRef} className="relative flex flex-col items-start gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((id) => {
            const opt = options.find((o) => o.id === id)
            if (!opt) return null
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 py-1 pl-3 pr-1 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
              >
                {opt.label}
                <button
                  type="button"
                  onClick={() => onToggle(id)}
                  aria-label={`Remove ${opt.label}`}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-rose-200/80 dark:hover:bg-rose-900"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs font-medium transition-colors',
          open
            ? 'border-neutral-400 bg-neutral-50 text-neutral-700 dark:border-neutral-500 dark:bg-neutral-800 dark:text-neutral-200'
            : 'border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-200',
        )}
      >
        <Plus className="h-3 w-3" />
        {addLabel}
      </button>

      {open && (
        <div
          role="dialog"
          className={cn(
            'absolute left-0 top-0 z-50 w-80 max-w-full',
            'rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg',
            'dark:border-neutral-700 dark:bg-neutral-900',
          )}
        >
          {options.length === 0 ? (
            <p className="px-2 py-2 text-sm text-neutral-500">
              {emptyPopoverCopy ?? 'Nothing to pick.'}
            </p>
          ) : (
            <ul className="max-h-72 space-y-0.5 overflow-y-auto">
              {options.map((opt) => {
                const isOn = selected.includes(opt.id)
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(opt.id)}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                          isOn
                            ? 'border-rose-500 bg-rose-500 text-white'
                            : 'border-neutral-300 dark:border-neutral-600',
                        )}
                      >
                        {isOn && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {opt.label}
                        </span>
                        {opt.description && (
                          <span className="text-xs leading-tight text-neutral-500 dark:text-neutral-400">
                            {opt.description}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// -----------------------------
// Q3 — Required toggle chips (subset of chosen)
// -----------------------------

function RequiredToggleField({
  attrs,
  required,
  onToggle,
}: {
  attrs: BuilderSchema['attrs']
  required: string[]
  onToggle: (key: string) => void
}) {
  if (attrs.length === 0) {
    return <p className="text-sm text-neutral-500">No attributes to mark.</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {attrs.map((a) => {
        const isRequired = required.includes(a.key)
        return (
          <button
            key={a.key}
            type="button"
            onClick={() => onToggle(a.key)}
            aria-pressed={isRequired}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              isRequired
                ? 'border-rose-500 bg-rose-500 text-white shadow-sm hover:bg-rose-600'
                : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-600',
            )}
          >
            {isRequired ? <Check className="h-3 w-3" /> : <span className="h-3 w-3" aria-hidden />}
            {a.label}
          </button>
        )
      })}
    </div>
  )
}

// -----------------------------
// Q4 — Per-platform three-state rows
// -----------------------------

function PlatformStateList({
  getState,
  onChange,
}: {
  getState: (id: BuilderPlatformId) => PlatformState
  onChange: (id: BuilderPlatformId, next: PlatformState) => void
}) {
  return (
    <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
      {BUILDER_PLATFORMS.map((p) => {
        const value = getState(p.id)
        return (
          <div
            key={p.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {p.label}
              </div>
              <div className="font-mono text-[11px] text-neutral-400 dark:text-neutral-500">
                {p.id}
              </div>
            </div>
            <ThreeStateControl value={value} onChange={(v) => onChange(p.id, v)} />
          </div>
        )
      })}
    </div>
  )
}

function ThreeStateControl({
  value,
  onChange,
}: {
  value: PlatformState
  onChange: (next: PlatformState) => void
}) {
  const options: Array<{ value: PlatformState; label: string }> = [
    { value: 'off', label: 'Off' },
    { value: 'optional', label: 'Optional' },
    { value: 'required', label: 'Required' },
  ]
  return (
    <div
      role="radiogroup"
      className="inline-flex rounded-full border border-neutral-200 bg-neutral-100 p-0.5 dark:border-neutral-700 dark:bg-neutral-800"
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-white text-rose-700 shadow-sm ring-1 ring-rose-200 dark:bg-neutral-900 dark:text-rose-300 dark:ring-rose-900/60'
                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
