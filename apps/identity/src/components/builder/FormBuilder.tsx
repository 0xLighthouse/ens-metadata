'use client'

import { CreatorPreviewCard } from '@/components/builder/CreatorPreviewCard'
import { IntentCreator } from '@/components/builder/IntentCreator'
import {
  BUILDER_PLATFORMS,
  BUILDER_SCHEMAS,
  type BuilderPlatformId,
  type BuilderSchema,
} from '@/config/builder-schemas'
import { cn } from '@/lib/utils'
import type { IntentConfig } from '@ensmetadata/shared/intent'
import { Check } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Pill } from './Pill'

/**
 * Form builder. Actor composes an ask — what classes to allow, which
 * fields are required vs optional, which social accounts to attest —
 * then signs an intent. The recipient opens `/<id>` and the wizard
 * loads the config plus the creator's ENS profile.
 */

const DEFAULT_SCHEMA_ID = 'person'
const ALLOWED_SCHEMA_IDS = ['person', 'org'] as const

interface BuilderState {
  schemaId: string
  /** Keys the recipient MUST fill in. */
  required: string[]
  /** Keys the recipient MAY fill in. Disjoint with required. */
  optional: string[]
  /** Platforms the recipient MUST link. Disjoint with optionalPlatforms. */
  requiredPlatforms: BuilderPlatformId[]
  /** Platforms shown as linkable but skippable. Disjoint with requiredPlatforms. */
  optionalPlatforms: BuilderPlatformId[]
  message: string
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
    schemaId: DEFAULT_SCHEMA_ID,
    required: [],
    optional: [],
    requiredPlatforms: [],
    optionalPlatforms: [],
    message: '',
  })
  const [schemaPillOpen, setSchemaPillOpen] = useState(false)

  const selectedSchema = useMemo(() => resolveSchema(state.schemaId), [state.schemaId])
  const availableAttrs = selectedSchema?.attrs ?? []
  // Pass a lazy builder instead of a precomputed value — signing reads the
  // latest state, and we don't want a stale closure if the user keeps editing
  // while the wallet is prompting.
  const buildConfig = useCallback(() => buildConfigFromState(state), [state])

  // Picking a key as required removes it from optional and vice versa —
  // the two pills are mutually exclusive. Unpicking removes from both.
  const toggleRequired = (key: string) =>
    setState((s) => {
      const isOn = s.required.includes(key)
      return {
        ...s,
        required: isOn ? s.required.filter((k) => k !== key) : [...s.required, key],
        optional: isOn ? s.optional : s.optional.filter((k) => k !== key),
      }
    })

  const toggleOptional = (key: string) =>
    setState((s) => {
      const isOn = s.optional.includes(key)
      return {
        ...s,
        optional: isOn ? s.optional.filter((k) => k !== key) : [...s.optional, key],
        required: isOn ? s.required : s.required.filter((k) => k !== key),
      }
    })

  const toggleRequiredPlatform = (id: BuilderPlatformId) =>
    setState((s) => {
      const isOn = s.requiredPlatforms.includes(id)
      return {
        ...s,
        requiredPlatforms: isOn ? s.requiredPlatforms.filter((p) => p !== id) : [...s.requiredPlatforms, id],
        optionalPlatforms: s.optionalPlatforms.filter((p) => p !== id),
      }
    })

  const toggleOptionalPlatform = (id: BuilderPlatformId) =>
    setState((s) => {
      const isOn = s.optionalPlatforms.includes(id)
      return {
        ...s,
        optionalPlatforms: isOn ? s.optionalPlatforms.filter((p) => p !== id) : [...s.optionalPlatforms, id],
        requiredPlatforms: s.requiredPlatforms.filter((p) => p !== id),
      }
    })

  const selectSchema = (target: BuilderSchema) =>
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
      }
    })

  return (
    <div className="space-y-8">
      <CreatorPreviewCard
        message={state.message}
        onMessageChange={(message) => setState((s) => ({ ...s, message }))}
      />
      <div className="rounded-3xl bg-rose-50 p-8 text-rose-900 shadow-sm dark:bg-rose-950/30 dark:text-rose-100 md:p-10">
        <p className="text-[1.4rem] leading-[1.8] md:text-[1.65rem] md:leading-[1.9]">
          This link will walk the user through setting up their profile for a{' '}
          <Pill
            unset={!selectedSchema}
            placeholder="schema type"
            label={selectedSchema?.label ?? 'schema type'}
            open={schemaPillOpen}
            onOpenChange={setSchemaPillOpen}
          >
            <SchemaPicker
              selectedId={state.schemaId}
              onSelect={(s) => {
                selectSchema(s)
                setSchemaPillOpen(false)
              }}
            />
          </Pill>
          . We will require them to fill out{' '}
          <Pill
            unset={state.required.length === 0}
            placeholder="required fields"
            label={fieldsLabel(state.required, 'required fields')}
          >
            <FieldPicker
              attrs={availableAttrs}
              selected={state.required}
              onToggle={toggleRequired}
              disabledKeys={state.optional}
              emptyCopy="Pick a schema first."
            />
          </Pill>
          . It will be optional for them to fill out{' '}
          <Pill
            unset={state.optional.length === 0}
            placeholder="optional fields"
            label={fieldsLabel(state.optional, 'optional fields')}
          >
            <FieldPicker
              attrs={availableAttrs}
              selected={state.optional}
              onToggle={toggleOptional}
              disabledKeys={state.required}
              emptyCopy="Pick a schema first."
            />
          </Pill>
          . We will require them to link their{' '}
          <Pill
            unset={state.requiredPlatforms.length === 0}
            placeholder="required accounts"
            label={platformsLabel(state.requiredPlatforms)}
          >
            <PlatformPicker
              selected={state.requiredPlatforms}
              onToggle={toggleRequiredPlatform}
              disabledIds={state.optionalPlatforms}
            />
          </Pill>
          , but they can also link their{' '}
          <Pill
            unset={state.optionalPlatforms.length === 0}
            placeholder="optional accounts"
            label={platformsLabel(state.optionalPlatforms)}
          >
            <PlatformPicker
              selected={state.optionalPlatforms}
              onToggle={toggleOptionalPlatform}
              disabledIds={state.requiredPlatforms}
            />
          </Pill>{' '}
          if they wish.
        </p>
      </div>

      <IntentCreator buildConfig={buildConfig} />
    </div>
  )
}

// -----------------------------
// Pickers
// -----------------------------

function SchemaPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string
  onSelect: (s: BuilderSchema) => void
}) {
  const options = BUILDER_SCHEMAS.filter((s) =>
    (ALLOWED_SCHEMA_IDS as readonly string[]).includes(s.id),
  )
  return (
    <ul className="space-y-1">
      {options.map((s) => {
        const isOn = selectedId === s.id
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s)}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <span
                className={cn(
                  'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  isOn
                    ? 'border-rose-500 bg-rose-500 text-white'
                    : 'border-neutral-300 dark:border-neutral-600',
                )}
              >
                {isOn && <Check className="h-3 w-3" />}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="block text-xs text-neutral-500">{s.description}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function FieldPicker({
  attrs,
  selected,
  onToggle,
  disabledKeys,
  emptyCopy,
}: {
  attrs: BuilderSchema['attrs']
  selected: string[]
  onToggle: (key: string) => void
  disabledKeys: string[]
  emptyCopy: string
}) {
  if (attrs.length === 0) {
    return <p className="text-sm text-neutral-500">{emptyCopy}</p>
  }
  const disabled = new Set(disabledKeys)
  return (
    <ul className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
      {attrs.map((a) => {
        const isOn = selected.includes(a.key)
        const isDisabled = disabled.has(a.key)
        return (
          <li key={a.key}>
            <button
              type="button"
              onClick={() => !isDisabled && onToggle(a.key)}
              disabled={isDisabled}
              className={cn(
                'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                isDisabled
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                  isOn
                    ? 'border-rose-500 bg-rose-500 text-white'
                    : 'border-neutral-300 dark:border-neutral-600',
                )}
              >
                {isOn && <Check className="h-3 w-3" />}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">
                  {a.label}
                  {isDisabled && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-neutral-400">
                      in the other pill
                    </span>
                  )}
                </span>
                {a.description && (
                  <span className="block text-xs text-neutral-500">{a.description}</span>
                )}
                <span className="block font-mono text-[11px] text-neutral-400">{a.key}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function PlatformPicker({
  selected,
  onToggle,
  disabledIds = [],
}: {
  selected: BuilderPlatformId[]
  onToggle: (id: BuilderPlatformId) => void
  disabledIds?: BuilderPlatformId[]
}) {
  const disabled = new Set(disabledIds)
  return (
    <ul className="space-y-1">
      {BUILDER_PLATFORMS.map((p) => {
        const isOn = selected.includes(p.id)
        const isDisabled = disabled.has(p.id)
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => !isDisabled && onToggle(p.id)}
              disabled={isDisabled}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                isDisabled
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                  isOn
                    ? 'border-rose-500 bg-rose-500 text-white'
                    : 'border-neutral-300 dark:border-neutral-600',
                )}
              >
                {isOn && <Check className="h-3 w-3" />}
              </span>
              <span className="text-sm font-medium">{p.label}</span>
              {isDisabled && (
                <span className="ml-1 text-[10px] uppercase tracking-wider text-neutral-400">
                  in the other pill
                </span>
              )}
              <span className="ml-auto font-mono text-[11px] text-neutral-400">{p.id}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// -----------------------------
// Labels
// -----------------------------

function fieldsLabel(keys: string[], fallback: string): string {
  if (keys.length === 0) return fallback
  if (keys.length === 1) return keys[0]!
  if (keys.length === 2) return `${keys[0]}, ${keys[1]}`
  return `${keys[0]}, ${keys[1]} +${keys.length - 2}`
}

function platformsLabel(ids: BuilderPlatformId[]): string {
  if (ids.length === 0) return ''
  return ids.map((id) => BUILDER_PLATFORMS.find((p) => p.id === id)?.label ?? id).join(' + ')
}
