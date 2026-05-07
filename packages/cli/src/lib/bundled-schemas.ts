import { getPublishedRegistry } from '@ensmetadata/schemas/published'
import type { Schema } from '@ensmetadata/schemas/types'

/**
 * Look up a schema by CID in the bundled `@ensmetadata/schemas` registry.
 * Returns `null` if the CID isn't tracked locally — the SDK's
 * `fetchSchemaByUri` then falls back to the IPFS gateway. Directory-style
 * locations (`CID/sub/path`) always fall through, since the bundled
 * registry only indexes single-file CIDs.
 */
export async function bundledSchemaResolver(location: string): Promise<Schema | null> {
  if (location.includes('/')) return null
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
