'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWeb3 } from '@/contexts/Web3Provider'
import type { FetchedSchema, SchemaProperty } from '@/lib/use-schema'
import { computeDelta, metadataReader } from '@ensmetadata/sdk'
import { useEffect, useMemo, useState } from 'react'

interface Props {
  /** ENS name being attested. */
  name: string
  /** Text record keys the agent asked the user to fill in. */
  requestedAttrs: string[]
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
   * Receives only the records that need to be written — the diff between
   * what's currently on chain and what the user submitted. Records that
   * already match the existing value are omitted, so the eventual
   * setMetadata multicall only touches what actually changed.
   */
  onComplete: (records: Record<string, string>) => void
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
  requestedAttrs,
  classValue,
  schemaUri,
  schema,
  onBack,
  onComplete,
}: Props) {
  const { publicClient } = useWeb3()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(requestedAttrs.map((k) => [k, ''])),
  )
  const [loaded, setLoaded] = useState<Record<string, string | null> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Keys to fetch from chain — the requested attrs plus the structural
  // class/schema records, since we want to skip writing those if they
  // already match the values supplied via the URL.
  const allKeys = useMemo(() => {
    const keys = [...requestedAttrs]
    if (classValue) keys.push('class')
    if (schemaUri) keys.push('schema')
    return [...new Set(keys)]
  }, [requestedAttrs, classValue, schemaUri])

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
        // biome-ignore lint/suspicious/noExplicitAny: ensjs-extended PublicClient
        const reader = metadataReader()(publicClient as any)
        const result = await reader.getMetadata({ name, keys: allKeys })
        if (cancelled) return
        const properties = result.properties as Record<string, string | null>
        setLoaded(properties)
        setValues((prev) => {
          const next = { ...prev }
          for (const key of requestedAttrs) {
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
  }, [publicClient, name, allKeys, requestedAttrs])

  const handleContinue = () => {
    // Build the desired-state map. Empty strings stay empty (computeDelta
    // treats empty + empty as no-op, empty + present as deletion — but we
    // skip the deletion case in this version by not emitting deletes).
    const desired: Record<string, string> = { ...values }
    if (classValue) desired.class = classValue
    if (schemaUri) desired.schema = schemaUri

    // Diff against the loaded baseline. Returns { changes, deleted }; we
    // only act on `changes` for now since the wizard doesn't surface
    // a "clear this record" UI.
    const original = loaded ?? {}
    const delta = computeDelta(original, desired)
    onComplete(delta.changes)
  }

  const isLoading = loaded === null
  const hiddenRecords: Array<[string, string]> = []
  if (classValue) hiddenRecords.push(['class', classValue])
  if (schemaUri) hiddenRecords.push(['schema', schemaUri])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{schema?.title ? `${schema.title} profile` : 'Profile attributes'}</CardTitle>
        <CardDescription>
          {schema?.description ? <>{schema.description} </> : null}
          Fill in the records the agent asked for on{' '}
          <span className="font-mono">{name}</span>. Existing values are pre-loaded; only fields
          you change will get written.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
            Loading existing records from <span className="font-mono">{name}</span>…
          </div>
        )}

        {loadError && (
          <div className="rounded-md border border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-3 text-xs text-yellow-900 dark:text-yellow-100">
            Couldn&apos;t load existing records (<span className="font-mono">{loadError}</span>).
            Continuing without pre-fill — anything you enter will be written as new.
          </div>
        )}

        {!isLoading && requestedAttrs.length === 0 && hiddenRecords.length > 0 && (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-4 text-sm text-neutral-600 dark:text-neutral-400">
            No fields to fill in — the agent only asked to set the structural records below.
          </div>
        )}

        {!isLoading &&
          requestedAttrs.map((key) => {
            const existing = loaded?.[key]
            const current = values[key] ?? ''
            const unchanged = typeof existing === 'string' && existing === current && current !== ''
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
                  <Label htmlFor={`attr-${key}`}>{labelText}</Label>
                  {unchanged && (
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">
                      unchanged
                    </span>
                  )}
                </div>
                <Input
                  id={`attr-${key}`}
                  type={inputType}
                  value={current}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={placeholder}
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
              {hiddenRecords.map(([k, v]) => {
                const existing = loaded?.[k]
                const unchanged = typeof existing === 'string' && existing === v
                return (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="font-mono text-neutral-500 dark:text-neutral-400">{k}</dt>
                    <dd className="font-mono truncate flex items-center gap-2">
                      <span>{v}</span>
                      {unchanged && (
                        <span className="text-neutral-400 dark:text-neutral-500">unchanged</span>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} full>
            Back
          </Button>
          <Button onClick={handleContinue} full disabled={isLoading}>
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
