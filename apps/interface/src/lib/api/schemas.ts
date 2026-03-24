import type { Schema } from '@/stores/schemas'
import { getPublishedRegistry } from '@ensmetadata/schemas/published'
import { fetchGlobals } from './globals'

/**
 * Fetch all available schemas from the published registry
 */
export async function fetchSchemas(): Promise<Schema[]> {
  const [registry, globals] = await Promise.all([getPublishedRegistry(), fetchGlobals()])
  const ensip5Properties = globals['ensip-5']?.properties ?? {}
  const schemas: Schema[] = []

  // Extract all published versions of each schema from the registry
  for (const [schemaId, schemaData] of Object.entries(registry.schemas)) {
    // Skip globals schema
    // We fetch globals separately
    if (schemaId === 'globals') continue

    const latestVersion = schemaData.latest

    for (const [version, versionEntry] of Object.entries(schemaData.published)) {
      if (!versionEntry?.schema) {
        console.warn(`Schema not loaded for ${schemaId} v${version}`)
        continue
      }

      schemas.push({
        ...versionEntry.schema,
        properties: {
          ...ensip5Properties,
          ...versionEntry.schema.properties,
        },
        id: `ipfs://${versionEntry.cid}`,
        title: `${schemaId}-v${version}`,
        class: versionEntry.schema.title,
        isLatest: version === latestVersion,
      })
    }
  }

  return schemas
}

/**
 * Fetch a specific schema by ID
 */
export async function fetchSchemaById(id: string): Promise<Schema | null> {
  const schemas = await fetchSchemas()
  return schemas.find((s) => s.id === id) || null
}

/**
 * Fetch the latest version of a schema by name
 */
export async function fetchLatestSchemaByName(name: string): Promise<Schema | null> {
  const schemas = await fetchSchemas()
  return schemas.find((s) => s.class === name) || null
}
