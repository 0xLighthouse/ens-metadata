'use client'

import { useEffect, useState } from 'react'
import { isEnsip5Global } from './ensip-5'

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
  /** Merged schema across all fetched URIs. First URI wins for title /
   *  description; property maps are unioned. Null while loading or on error. */
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

async function fetchOne(uri: string): Promise<FetchedSchema> {
  const url = resolveSchemaUrl(uri)
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
  return fetched
}

/**
 * Fetch and validate one or more JSON Schema documents referenced by URI.
 * Returns a single merged schema (properties unioned, title/description
 * from the first) so downstream form rendering stays schema-count agnostic.
 *
 * The wizard runs this at the root: a broken schema would commit garbage
 * into the on-chain `schema` text record, so the wizard must refuse to
 * proceed past step 0 until every schema is either valid or the list is
 * empty.
 *
 * Errors surfaced (any of these blocks the wizard):
 *   - HTTP failure from the gateway for any schema
 *   - A body isn't valid JSON
 *   - A body isn't a JSON object
 *   - A body has no `properties` map (not a JSON Schema)
 *   - A `requiredKey` isn't defined in ANY fetched schema AND isn't an
 *     ENSIP-5 global
 *
 * When `schemaUris` is empty the hook is a no-op — returns
 * { schema: null, loading: false, error: null } and nothing is fetched.
 */
export function useSchema(
  schemaUris: readonly string[],
  requiredKeys: readonly string[],
): UseSchemaResult {
  const [schema, setSchema] = useState<FetchedSchema | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stable deps for the array inputs — reference equality on arrays would
  // re-fire the effect on every render. Joining is fine: strings are short
  // and this runs once per wizard session.
  const urisKey = schemaUris.join('|')
  const keysKey = requiredKeys.join('|')

  useEffect(() => {
    if (schemaUris.length === 0) {
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
        const fetched = await Promise.all(schemaUris.map((uri) => fetchOne(uri)))
        // Union properties; first schema wins on title/description since
        // it's the primary one that gets written to chain.
        const mergedProps: Record<string, SchemaProperty> = {}
        for (const s of fetched) {
          for (const [k, v] of Object.entries(s.properties ?? {})) {
            if (!(k in mergedProps)) mergedProps[k] = v
          }
        }
        const merged: FetchedSchema = {
          title: fetched[0]?.title,
          description: fetched[0]?.description,
          properties: mergedProps,
        }
        // Every required key must be defined in the merged property set
        // or be an ENSIP-5 global. ENSIP-5 globals are universally valid
        // text records regardless of schema.
        const missing = requiredKeys.filter((k) => !(k in mergedProps) && !isEnsip5Global(k))
        if (missing.length > 0) {
          throw new Error(
            `schema does not define requested attribute${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
          )
        }
        if (!cancelled) {
          setSchema(merged)
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
  }, [urisKey, keysKey])

  return { schema, loading, error }
}
