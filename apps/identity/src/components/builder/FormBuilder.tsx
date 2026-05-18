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
import { usePrivy } from '@privy-io/react-auth'
import { Check, Plus, X } from 'lucide-react'
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
  // Dropdown value before the user presses Load. Kept separate from
  // state.schemaId so downstream sections stay inactive until commit.
  const [pendingSchemaId, setPendingSchemaId] = useState('')
  // Q1 is gated on a connected wallet — same model as CreatorPreviewCard.
  // If the user disconnects mid-session we tear the form back down to step
  // zero so the UI never claims a schema is loaded against no wallet.
  const { authenticated: walletConnected } = usePrivy()

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

  // Commit the pending dropdown selection. Q2/Q3/Q4 unlock from here.
  const loadSchema = () => {
    if (!resolveSchema(pendingSchemaId)) return
    setState((s) => ({ ...s, schemaId: pendingSchemaId }))
  }

  // Release the loaded schema: re-enable the dropdown and clear anything the
  // user picked under the previous schema so the URL can't carry orphans.
  const unloadSchema = () => {
    setState((s) => ({
      ...s,
      schemaId: '',
      required: [],
      optional: [],
      chosenOrder: [],
    }))
  }

  // Disconnect mid-session → revert to the pre-load state. Mirrors what
  // pressing Change would have done, plus clears the pending dropdown.
  useEffect(() => {
    if (walletConnected) return
    setPendingSchemaId('')
    setState((s) =>
      s.schemaId === '' && s.required.length === 0 && s.optional.length === 0
        ? s
        : { ...s, schemaId: '', required: [], optional: [], chosenOrder: [] },
    )
  }, [walletConnected])

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
            title="What type of user is this form intended for?"
            description="Pick the type of entity this profile will represent."
            active={walletConnected}
            inactiveHint="Connect your wallet to begin."
          >
            <SchemaLoader
              options={BUILDER_SCHEMAS}
              pendingId={pendingSchemaId}
              onPendingChange={setPendingSchemaId}
              loadedId={state.schemaId}
              onLoad={loadSchema}
              onUnload={unloadSchema}
              disabled={!walletConnected}
            />
          </GuidedSection>

          <GuidedSection
            number="02"
            title="What details do you want from your users?"
            description="Pick the attributes you want on the form."
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
            description="Users must fill these in before they can submit."
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
            title="Which social accounts do you want to verify?"
            description="Users can prove ownership of a social account and generate an attestation. Required accounts must be linked before they can continue."
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
// Q1 — Schema dropdown + Load/Change button
// -----------------------------

function SchemaLoader({
  options,
  pendingId,
  onPendingChange,
  loadedId,
  onLoad,
  onUnload,
  disabled,
}: {
  options: BuilderSchema[]
  pendingId: string
  onPendingChange: (id: string) => void
  loadedId: string
  onLoad: () => void
  onUnload: () => void
  disabled?: boolean
}) {
  const isLoaded = loadedId !== ''
  // Once loaded, show the loaded schema in the (disabled) dropdown regardless
  // of what `pendingId` is — that way "Change" reliably shows the schema the
  // user is about to unload.
  const selectValue = isLoaded ? loadedId : pendingId
  const selectedSchema = options.find((o) => o.id === selectValue)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectValue}
          onChange={(e) => onPendingChange(e.target.value)}
          disabled={disabled || isLoaded}
          className={cn(
            'min-w-[12rem] flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 transition-colors',
            'focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500/20',
            'disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500',
            'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:disabled:bg-neutral-900/40',
          )}
        >
          <option value="" disabled>
            Select a schema…
          </option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label} (v {opt.version})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={isLoaded ? onUnload : onLoad}
          disabled={disabled || (!isLoaded && pendingId === '')}
          className={cn(
            'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-50',
            isLoaded
              ? 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800'
              : 'border-rose-500 bg-rose-500 text-white hover:bg-rose-600 disabled:hover:bg-rose-500',
          )}
        >
          {isLoaded ? 'Change' : 'Load'}
        </button>
      </div>
      {selectedSchema?.description && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {selectedSchema.description}
        </p>
      )}
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
    { value: 'off', label: 'Disabled' },
    { value: 'required', label: 'Required' },
    { value: 'optional', label: 'Optional' },
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
            // biome-ignore lint/a11y/useSemanticElements: stylized chip toggle inside a radiogroup; a native <input type="radio"> won't accept this visual treatment.
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
