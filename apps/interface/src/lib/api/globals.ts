import { getPublishedRegistry } from '@ensmetadata/schemas/published'
import type { Schema as BaseSchema } from '@ensmetadata/schemas/types'

/**
 * Fetch all global sub-schemas (e.g. ENSIP-5) from the published globals bundle
 * Returns a map keyed by global schema name (e.g. "ensip-5")
 */
export async function fetchGlobals(): Promise<Record<string, BaseSchema>> {
  const registry = await getPublishedRegistry()
  const globalsData = registry.schemas.globals
  if (!globalsData) return {}

  const latestVersion = globalsData.latest
  const versionEntry = globalsData.published[latestVersion]
  if (!versionEntry?.schema?.schemas) return {}

  return versionEntry.schema.schemas as Record<string, BaseSchema>
}
