import { getPublishedRegistry } from '@ensmetadata/schemas/published'
import type { Schema } from '@ensmetadata/schemas/types'

/**
 * Look up a schema by CID in the bundled `@ensmetadata/schemas` registry.
 * Returns `null` if the URI isn't an `ipfs://` URI, isn't a single-file CID
 * (directory-style `ipfs://CID/sub/path` falls through), or isn't tracked
 * locally. The SDK's `fetchSchema` then falls back to the appropriate
 * protocol fetcher.
 */
export async function bundledSchemaResolver(uri: string): Promise<Schema | null> {
  const trimmed = uri.trim()
  if (!trimmed.startsWith('ipfs://')) return null
  const location = trimmed.slice('ipfs://'.length).replace(/^\/+/, '')
  if (!location || location.includes('/')) return null
  const registry = await getPublishedRegistry()
  for (const schemaData of Object.values(registry.schemas)) {
    for (const versionData of Object.values(schemaData.published)) {
      if (versionData.cid === location && versionData.schema) {
        return versionData.schema as Schema
      }
    }
  }
  return null
}
