import { SCHEMA_MAP } from '@ensmetadata/schemas'
import { getPublishedRegistry } from '@ensmetadata/schemas/published'
import type { Attribute, Schema } from '@ensmetadata/schemas/types'
import { z } from 'zod'

/**
 * Map a schema title to its registry id. Most schemas use the lowercased
 * title verbatim; `Organization` is the only special case (registered as
 * `org` in the published registry).
 */
function titleToRegistryId(title: string): string {
  const lower = title.toLowerCase()
  return lower === 'organization' ? 'org' : lower
}

/**
 * Resolve a user-supplied type string to a schema and its registry id.
 * Accepts either the registry id (e.g. `agent`, `org`) or the schema title
 * (e.g. `Agent`, `Organization`), case-insensitively.
 */
function resolveSchemaRef(input: string): { schema: Schema; registryId: string } {
  const lower = input.trim().toLowerCase()
  if (!lower) {
    throw new Error('Schema type is required.')
  }
  for (const schema of Object.values(SCHEMA_MAP)) {
    const id = titleToRegistryId(schema.title)
    if (id === lower || schema.title.toLowerCase() === lower) {
      return { schema, registryId: id }
    }
  }
  const known = Object.values(SCHEMA_MAP)
    .map((s) => titleToRegistryId(s.title))
    .sort()
    .join(', ')
  throw new Error(`Unknown schema type: "${input}". Known types: ${known}.`)
}

/**
 * Build a payload skeleton from a schema's concrete `properties`.
 * `class` is pre-filled with its declared default; `schema` is set to the
 * supplied IPFS URI; every other property is initialised to an empty string.
 * `patternProperties` are intentionally excluded.
 */
export function buildTemplatePayload(schema: Schema, ipfsUri: string): Record<string, string> {
  const out: Record<string, string> = {}
  const entries = Object.entries(schema.properties) as Array<[string, Attribute]>
  for (const [key, prop] of entries) {
    if (key === 'schema') {
      out[key] = ipfsUri
    } else if (key === 'class') {
      out[key] = prop.default ?? ''
    } else {
      out[key] = ''
    }
  }
  return out
}

const templateOptions = z.object({
  version: z
    .string()
    .optional()
    .describe('Schema version to reference (defaults to the latest published version).'),
})

export const templateCommand = {
  description: 'Generate an empty ENS metadata payload template for the given schema type',
  args: z.object({
    type: z
      .string()
      .describe(
        'Schema type. Accepts the registry id (e.g. agent, org) or the schema title (e.g. Agent, Organization).',
      ),
  }),
  options: templateOptions,
  format: 'json' as const,
  async run(c: { args: { type: string }; options: z.infer<typeof templateOptions> }) {
    const { schema, registryId } = resolveSchemaRef(c.args.type)

    const registry = await getPublishedRegistry()
    const published = registry.schemas[registryId]
    if (!published) {
      throw new Error(`No published versions found for schema type "${registryId}".`)
    }

    const version = c.options.version ?? published.latest
    const entry = published.published[version]
    if (!entry) {
      const available = Object.keys(published.published).sort().join(', ')
      throw new Error(
        `Version "${version}" not found for schema "${registryId}". Available versions: ${available}.`,
      )
    }
    if (!entry.cid) {
      throw new Error(`No IPFS CID recorded for ${registryId} v${version}.`)
    }

    return buildTemplatePayload(schema, `ipfs://${entry.cid}`)
  },
}
