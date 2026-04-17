'use client'

import { IntentCreator } from '@/components/builder/IntentCreator'
import {
  BUILDER_PLATFORMS,
  BUILDER_SCHEMAS,
  type BuilderPlatformId,
  type BuilderSchema,
} from '@/config/builder-schemas'
import { cn } from '@/lib/utils'
import type { IntentConfig } from '@ensmetadata/shared/intent'
import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Pill } from './Pill'

/**
 * Form builder. Actor composes an ask — what classes to allow, which
 * fields are required vs optional, which social accounts to attest —
 * then signs an intent. The recipient opens `/?intent=<id>` and the
 * wizard loads the config plus the creator's ENS profile.
 */

const DEFAULT_SCHEMA_ID = 'person'

interface BuilderState {
  schemaIds: string[]
  /** Keys the recipient MUST fill in. */
  required: string[]
  /** Keys the recipient MAY fill in. Disjoint with required. */
  optional: string[]
  platforms: BuilderPlatformId[]
  name: string
  message: string
}

function resolveSchemas(ids: readonly string[]): BuilderSchema[] {
  return ids
    .map((id) => BUILDER_SCHEMAS.find((s) => s.id === id))
    .filter((s): s is BuilderSchema => !!s)
}

/** Union of attr lists across selected schemas, deduplicated by key. */
function unionAttrs(schemas: readonly BuilderSchema[]): BuilderSchema['attrs'] {
  const seen = new Set<string>()
  const out: BuilderSchema['attrs'] = []
  for (const s of schemas) {
    for (const a of s.attrs) {
      if (seen.has(a.key)) continue
      seen.add(a.key)
      out.push(a)
    }
  }
  return out
}

function buildConfigFromState(state: BuilderState): IntentConfig | null {
  const schemas = resolveSchemas(state.schemaIds)
  if (schemas.length === 0) return null
  const name = state.name.trim()
  return {
    version: 1,
    name: name.length > 0 ? name : null,
    classValues: schemas.map((s) => s.classValue),
    schemaUris: schemas.map((s) => s.schemaUri),
    required: state.required,
    optional: state.optional,
    platforms: state.platforms,
    message: state.message,
  }
}

export function FormBuilder() {
  const [state, setState] = useState<BuilderState>({
    schemaIds: [DEFAULT_SCHEMA_ID],
    required: [],
    optional: [],
    platforms: [],
    name: '',
    message: '',
  })
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const selectedSchemas = useMemo(() => resolveSchemas(state.schemaIds), [state.schemaIds])
  const availableAttrs = useMemo(() => unionAttrs(selectedSchemas), [selectedSchemas])
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

  const togglePlatform = (id: BuilderPlatformId) =>
    setState((s) => ({
      ...s,
      platforms: s.platforms.includes(id)
        ? s.platforms.filter((p) => p !== id)
        : [...s.platforms, id],
    }))

  const toggleSchema = (target: BuilderSchema) =>
    setState((s) => {
      const nextIds = s.schemaIds.includes(target.id)
        ? s.schemaIds.filter((id) => id !== target.id)
        : [...s.schemaIds, target.id]
      // Dropping the last schema would break the URL; keep at least one.
      if (nextIds.length === 0) return s
      // Prune any previously-picked attrs that aren't offered by the new
      // union so the generated URL never carries orphan keys.
      const nextKeys = new Set(unionAttrs(resolveSchemas(nextIds)).map((a) => a.key))
      return {
        ...s,
        schemaIds: nextIds,
        required: s.required.filter((k) => nextKeys.has(k)),
        optional: s.optional.filter((k) => nextKeys.has(k)),
      }
    })

  return (
    <div className="space-y-8">
      <div className="rounded-3xl bg-rose-50 p-8 text-rose-900 shadow-sm dark:bg-rose-950/30 dark:text-rose-100 md:p-10">
        <p className="text-[1.4rem] leading-[1.8] md:text-[1.65rem] md:leading-[1.9]">
          Allow{' '}
          <Pill
            unset={selectedSchemas.length === 0}
            placeholder="a schema"
            label={schemasLabel(selectedSchemas)}
          >
            <SchemaPicker selectedSchemas={selectedSchemas} onToggle={toggleSchema} />
          </Pill>{' '}
          to be registered. Ensure{' '}
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
          </Pill>{' '}
          are present. Optionally ask them to fill in{' '}
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
          . We also want their{' '}
          <Pill
            unset={state.platforms.length === 0}
            placeholder="social accounts"
            label={platformsLabel(state.platforms)}
          >
            <PlatformPicker selected={state.platforms} onToggle={togglePlatform} />
          </Pill>{' '}
          to be attested.
        </p>
      </div>

      <AdvancedSection
        open={advancedOpen}
        onToggle={() => setAdvancedOpen((o) => !o)}
        name={state.name}
        onNameChange={(name) => setState((s) => ({ ...s, name }))}
        message={state.message}
        onMessageChange={(message) => setState((s) => ({ ...s, message }))}
      />

      <IntentCreator buildConfig={buildConfig} />
    </div>
  )
}

// -----------------------------
// Advanced options
// -----------------------------

function AdvancedSection({
  open,
  onToggle,
  name,
  onNameChange,
  message,
  onMessageChange,
}: {
  open: boolean
  onToggle: () => void
  name: string
  onNameChange: (v: string) => void
  message: string
  onMessageChange: (v: string) => void
}) {
  const summaryBits: string[] = []
  if (name) summaryBits.push(`for ${name}`)
  if (message) summaryBits.push('note attached')
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900"
      >
        <span>
          Advanced
          {summaryBits.length > 0 && (
            <span className="ml-2 text-xs text-neutral-500">{summaryBits.join(' · ')}</span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-neutral-200 p-4 dark:border-neutral-800">
          <div className="space-y-2">
            <label
              htmlFor="builder-name"
              className="text-xs font-medium uppercase tracking-wide text-neutral-500"
            >
              For (optional)
            </label>
            <input
              id="builder-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="alice.eth"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <p className="text-[11px] text-neutral-400">
              Leave blank to let the recipient type their own name.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="builder-msg"
              className="text-xs font-medium uppercase tracking-wide text-neutral-500"
            >
              Note for the recipient
            </label>
            <textarea
              id="builder-msg"
              value={message}
              onChange={(e) => onMessageChange(e.target.value.slice(0, 280))}
              rows={3}
              placeholder="Hey, could you fill this out for me?"
              className="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <div className="text-right text-[11px] text-neutral-400">{message.length}/280</div>
          </div>
        </div>
      )}
    </div>
  )
}

// -----------------------------
// Pickers
// -----------------------------

function SchemaPicker({
  selectedSchemas,
  onToggle,
}: {
  selectedSchemas: BuilderSchema[]
  onToggle: (s: BuilderSchema) => void
}) {
  const selectedIds = new Set(selectedSchemas.map((s) => s.id))
  return (
    <ul className="space-y-1">
      {BUILDER_SCHEMAS.map((s) => {
        const isOn = selectedIds.has(s.id)
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onToggle(s)}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
}: {
  selected: BuilderPlatformId[]
  onToggle: (id: BuilderPlatformId) => void
}) {
  return (
    <ul className="space-y-1">
      {BUILDER_PLATFORMS.map((p) => {
        const isOn = selected.includes(p.id)
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onToggle(p.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
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

function schemasLabel(schemas: BuilderSchema[]): string {
  if (schemas.length === 0) return 'a schema'
  if (schemas.length === 1) return schemas[0]!.label
  if (schemas.length === 2) return `${schemas[0]!.label} or ${schemas[1]!.label}`
  return `${schemas[0]!.label}, ${schemas[1]!.label} +${schemas.length - 2}`
}

function fieldsLabel(keys: string[], fallback: string): string {
  if (keys.length === 0) return fallback
  if (keys.length === 1) return keys[0]!
  if (keys.length === 2) return `${keys[0]}, ${keys[1]}`
  return `${keys[0]}, ${keys[1]} +${keys.length - 2}`
}

function platformsLabel(ids: BuilderPlatformId[]): string {
  if (ids.length === 0) return 'social accounts'
  return ids.map((id) => BUILDER_PLATFORMS.find((p) => p.id === id)?.label ?? id).join(' + ')
}
