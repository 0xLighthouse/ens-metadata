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
 * This runs at the page root on the server: a broken schema would commit
 * garbage into the on-chain `schema` text record, so the wizard must refuse
 * to even start until every schema is either valid or the list is empty.
 *
 * Throws on any of:
 *   - HTTP failure from the gateway
 *   - A body isn't valid JSON
 *   - A body isn't a JSON object
 *   - A body has no `properties` map (not a JSON Schema)
 *   - A `requiredKey` isn't defined in ANY fetched schema AND isn't an
 *     ENSIP-5 global
 *
 * Returns `null` when `schemaUris` is empty (nothing to fetch).
 */
export async function resolveSchemas(
  schemaUris: readonly string[],
  requiredKeys: readonly string[],
): Promise<FetchedSchema | null> {
  if (schemaUris.length === 0) return null

  const fetched = await Promise.all(schemaUris.map((uri) => fetchOne(uri)))

  // Union properties; first schema wins on title/description since it's the
  // primary one that gets written to chain.
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

  // Every required key must be defined in the merged property set or be an
  // ENSIP-5 global. ENSIP-5 globals are universally valid text records
  // regardless of schema.
  const missing = requiredKeys.filter((k) => !(k in mergedProps) && !isEnsip5Global(k))
  if (missing.length > 0) {
    throw new Error(
      `schema does not define requested attribute${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
    )
  }

  return merged
}
