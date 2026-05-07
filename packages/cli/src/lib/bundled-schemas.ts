import { getPublishedRegistry } from '@ensmetadata/schemas/published'
import type { Schema } from '@ensmetadata/schemas/types'

/**
 * Look up a schema by CID in the bundled `@ensmetadata/schemas` registry.
 * Returns `null` if the CID isn't tracked locally — the SDK's
 * `fetchSchemaByUri` then falls back to the IPFS gateway.
 */
export async function bundledSchemaResolver(cid: string): Promise<Schema | null> {
  const registry = await getPublishedRegistry()
  for (const schemaData of Object.values(registry.schemas)) {
    for (const versionData of Object.values(schemaData.published)) {
      if (versionData.cid === cid && versionData.schema) {
        return versionData.schema as Schema
      }
    }
  }
  return null
}
