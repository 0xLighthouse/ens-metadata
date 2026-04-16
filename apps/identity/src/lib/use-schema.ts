'use client'

import { useEffect, useState } from 'react'

/**
 * Minimal JSON Schema property shape — just the bits the wizard reads
 * for form metadata. Anything else in the schema is ignored.
 */
export interface SchemaProperty {
  type?: string
  title?: string
  description?: string
  examples?: unknown[]
  format?: string
}

export interface FetchedSchema {
  title?: string
  description?: string
  properties?: Record<string, SchemaProperty>
}

export interface UseSchemaResult {
  /** Resolved schema doc, or null while loading or on error. */
  schema: FetchedSchema | null
  /** True until the fetch settles. False when there's no schemaUri. */
  loading: boolean
  /** Human-readable error message, or null on success / no schema. */
  error: string | null
}

/**
 * Convert an `ipfs://CID[/path]` URI to an HTTP gateway URL. Pass-through
 * for anything that doesn't start with `ipfs://`.
 */
function resolveSchemaUrl(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    const path = uri.slice('ipfs://'.length).replace(/^\/+/, '')
    return `https://ipfs.io/ipfs/${path}`
  }
  return uri
}

/**
 * Fetch and validate a JSON Schema document referenced by URI, ensuring
 * the doc is well-formed AND defines every key the caller expects to use.
 *
 * The wizard runs this at the root: a broken schema would commit garbage
 * into the on-chain `schema` text record, so the wizard must refuse to
 * proceed past step 0 until the schema is either valid or absent.
 *
 * Errors surfaced (any of these blocks the wizard):
 *   - HTTP failure from the gateway
 *   - Body isn't valid JSON
 *   - Body isn't a JSON object
 *   - Body has no `properties` map (not a JSON Schema)
 *   - Body's `properties` doesn't include one or more `requiredKeys`
 *
 * When `schemaUri` is null/undefined the hook is a no-op — returns
 * { schema: null, loading: false, error: null } and nothing is fetched.
 */
export function useSchema(
  schemaUri: string | null | undefined,
  requiredKeys: readonly string[],
): UseSchemaResult {
  const [schema, setSchema] = useState<FetchedSchema | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stable dep for the requiredKeys array — reference equality on arrays
  // would re-fire the effect on every render even when the contents are
  // the same. Joining is fine: keys are short strings, this is a wizard
  // step that runs once.
  const keysKey = requiredKeys.join('|')

  useEffect(() => {
    if (!schemaUri) {
      setSchema(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setSchema(null)
    ;(async () => {
      try {
        const url = resolveSchemaUrl(schemaUri)
        const res = await fetch(url)
        if (!res.ok) {
          throw new Error(`fetch returned HTTP ${res.status} from ${url}`)
        }
        let json: unknown
        try {
          json = await res.json()
        } catch (parseErr) {
          throw new Error(
            `response is not valid JSON (${parseErr instanceof Error ? parseErr.message : 'parse error'})`,
          )
        }
        if (!json || typeof json !== 'object') {
          throw new Error('schema document is not an object')
        }
        const fetched = json as FetchedSchema
        if (!fetched.properties || typeof fetched.properties !== 'object') {
          throw new Error('schema document has no `properties` map — not a JSON Schema')
        }
        // Tighter check: every key the caller said it needs must be
        // defined in the schema. Catches typos and stale agent URL
        // templates before the user wastes effort filling in fields the
        // schema doesn't even know about.
        const missing = requiredKeys.filter((k) => !(k in (fetched.properties ?? {})))
        if (missing.length > 0) {
          throw new Error(
            `schema does not define requested attribute${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
          )
        }
        if (!cancelled) {
          setSchema(fetched)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setSchema(null)
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [schemaUri, keysKey])

  return { schema, loading, error }
}
