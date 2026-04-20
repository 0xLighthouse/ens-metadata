'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWeb3 } from '@/contexts/Web3Provider'
import { type RecordDiff, computeRecordDiff } from '@/lib/record-diff'
import type { FetchedSchema, SchemaProperty } from '@/lib/use-schema'
import { metadataReader } from '@ensmetadata/sdk'
import { useEffect, useMemo, useState } from 'react'

interface Props {
  /** ENS name being attested. */
  name: string
  /** Text record keys the recipient MUST fill in before Continue unlocks. */
  requiredAttrs: string[]
  /** Text record keys surfaced as form inputs but OK to leave blank. */
  optionalAttrs: string[]
  /**
   * Pre-set `class` text record value, supplied via the URL. Written
   * automatically alongside the requested attrs; not exposed as a form
   * field because it's meant to be agent-controlled, not user-edited.
   */
  classValue?: string
  /**
   * Pre-set `schema` text record value, supplied via the URL. Same
   * treatment as classValue — written but not edited.
   */
  schemaUri?: string
  /**
   * Resolved schema document, fetched + validated at the wizard root.
   * Used purely for form metadata (labels, descriptions, placeholders,
   * input types). Null when the URL didn't supply a schema URI.
   */
  schema: FetchedSchema | null
  onBack: () => void
  /**
   * Receives the full diff between what's currently on chain and what the
   * user submitted: additions, updates (with prior values), and removals.
   * ReviewStep uses this to render a proper add/update/remove preview and
   * derives the write payload at publish time.
   */
  onComplete: (diff: RecordDiff) => void
}

/**
 * Map JSON Schema `format` values to HTML input types. Anything we don't
 * recognise stays as `text`.
 */
function htmlInputType(prop: SchemaProperty | undefined): string {
  switch (prop?.format) {
    case 'email':
      return 'email'
    case 'tel':
      return 'tel'
    case 'uri':
    case 'url':
      return 'url'
    default:
      return 'text'
  }
}

export function EnterAttributesStep({
  name,
  requiredAttrs,
  optionalAttrs,
  classValue,
  schemaUri,
  schema,
  onBack,
  onComplete,
}: Props) {
  const { publicClient } = useWeb3()

  // All requested keys (required + optional), preserving the order the
  // actor specified. Used for the form inputs and the chain read.
  const allRequestedAttrs = useMemo(
    () => [...requiredAttrs, ...optionalAttrs],
    [requiredAttrs, optionalAttrs],
  )
  const requiredSet = useMemo(() => new Set(requiredAttrs), [requiredAttrs])

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(allRequestedAttrs.map((k) => [k, ''])),
  )
  const [loaded, setLoaded] = useState<Record<string, string | null> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Keys to fetch from chain — the requested attrs plus the structural
  // class/schema records, since we want to skip writing those if they
  // already match the values supplied via the URL.
  const allKeys = useMemo(() => {
    const keys = [...allRequestedAttrs]
    if (classValue) keys.push('class')
    if (schemaUri) keys.push('schema')
    return [...new Set(keys)]
  }, [allRequestedAttrs, classValue, schemaUri])

  // Load existing values on mount via the SDK's metadataReader. Pre-fills
  // the form inputs with whatever's already on chain so the user sees
  // current state instead of a blank form.
  useEffect(() => {
    if (!publicClient || allKeys.length === 0) {
      setLoaded({})
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const reader = metadataReader()(publicClient)
        const result = await reader.getMetadata({ name, keys: allKeys })
        if (cancelled) return
        const properties = result.properties as Record<string, string | null>
        setLoaded(properties)
        setValues((prev) => {
          const next = { ...prev }
          for (const key of allRequestedAttrs) {
            const existing = properties[key]
            if (typeof existing === 'string' && existing) next[key] = existing
          }
          return next
        })
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
        setLoaded({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [publicClient, name, allKeys, allRequestedAttrs])

  // Missing-required check — Continue is blocked until every required
  // key has a non-empty value (current input OR loaded-from-chain value).
  const missingRequired = useMemo(() => {
    return requiredAttrs.filter((k) => {
      const v = values[k]
      return typeof v !== 'string' || v.trim().length === 0
    })
  }, [requiredAttrs, values])

  const handleContinue = () => {
    if (missingRequired.length > 0) return
    // Build the desired-state map and diff it against what's on chain.
    // computeRecordDiff returns {added, updated, removed} with prior
    // values attached so the review screen can show exactly what will
    // change, including cleared fields.
    const desired: Record<string, string> = { ...values }
    if (classValue) desired.class = classValue
    if (schemaUri) desired.schema = schemaUri

    const original = loaded ?? {}
    onComplete(computeRecordDiff(original, desired))
  }

  const isLoading = loaded === null
  const hiddenRecords: Array<[string, string]> = []
  if (classValue) hiddenRecords.push(['class', classValue])
  if (schemaUri) hiddenRecords.push(['schema', schemaUri])

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {schema?.title ? `Complete your ${schema.title} profile` : 'Complete your profile'}
        </CardTitle>
        <CardDescription>
          {schema?.description ? <>{schema.description} </> : null}
          Enter the values below to be added to <span className="font-mono">{name}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
            Checking <span className="font-mono">{name}</span> for existing records...
          </div>
        )}

        {loadError && (
          <div className="rounded-md border border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-3 text-xs text-yellow-900 dark:text-yellow-100">
            Couldn&apos;t load existing records (<span className="font-mono">{loadError}</span>).
            Warning! Submitting new records risks overwriting existing data. It is okay to continue
            if this is what you want to do.
          </div>
        )}

        {!isLoading && allRequestedAttrs.length === 0 && hiddenRecords.length > 0 && (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-4 text-sm text-neutral-600 dark:text-neutral-400">
            No fields to fill in — the agent only asked to set the structural records below.
          </div>
        )}

        {!isLoading &&
          allRequestedAttrs.map((key) => {
            const current = values[key] ?? ''
            const isRequired = requiredSet.has(key)
            const isMissing = isRequired && current.trim().length === 0
            // Per-property metadata from the resolved schema, with sensible
            // fallbacks. The wizard root already validated that every
            // requested attr is defined in the schema, so this lookup
            // always finds something when `schema` is present.
            const prop = schema?.properties?.[key]
            const labelText = prop?.title ?? key
            const helpText = prop?.description
            const exampleFromSchema =
              Array.isArray(prop?.examples) && typeof prop.examples[0] === 'string'
                ? (prop.examples[0] as string)
                : undefined
            const placeholder = exampleFromSchema ?? placeholderFor(key)
            const inputType = htmlInputType(prop)

            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`attr-${key}`} className="flex items-center gap-2">
                    <span>{labelText}</span>
                    {isRequired ? (
                      <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
                        required
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">
                        optional
                      </span>
                    )}
                  </Label>
                </div>
                <Input
                  id={`attr-${key}`}
                  type={inputType}
                  value={current}
                  onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={placeholder}
                  aria-required={isRequired}
                  aria-invalid={isMissing}
                />
                {helpText && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{helpText}</p>
                )}
              </div>
            )
          })}

        {hiddenRecords.length > 0 && (
          <div className="rounded-md border border-dashed border-neutral-200 dark:border-neutral-700 p-3 text-xs">
            <div className="text-neutral-500 dark:text-neutral-400 mb-2">
              Also written automatically (only if different from current):
            </div>
            <dl className="space-y-1">
              {hiddenRecords.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="font-mono text-neutral-500 dark:text-neutral-400">{k}</dt>
                    <dd className="font-mono truncate">
                      <span>{v}</span>
                    </dd>
                  </div>
              ))}
            </dl>
          </div>
        )}

        {!isLoading && missingRequired.length > 0 && (
          <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100">
            Required field{missingRequired.length === 1 ? '' : 's'} still empty:{' '}
            <span className="font-mono">{missingRequired.join(', ')}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} full>
            Back
          </Button>
          <Button
            onClick={handleContinue}
            full
            disabled={isLoading || missingRequired.length > 0}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function placeholderFor(key: string): string {
  switch (key) {
    case 'avatar':
      return 'https://example.com/avatar.png  or  ipfs://...'
    case 'alias':
      return 'Alice Smith'
    case 'description':
      return 'A short bio'
    case 'email':
      return 'alice@example.com'
    case 'url':
      return 'https://alice.example'
    case 'phone':
      return '+1 555 555 5555'
    default:
      return ''
  }
}
