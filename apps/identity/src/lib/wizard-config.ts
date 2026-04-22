import type { IntentConfig } from '@ensmetadata/shared/intent'
import type { FetchedSchema } from './schema-resolver'
import { formatKeyName } from './utils'

export type Platform = 'com.x' | 'org.telegram'
const KNOWN_PLATFORMS: readonly Platform[] = ['com.x', 'org.telegram'] as const

function isPlatform(s: string): s is Platform {
  return (KNOWN_PLATFORMS as readonly string[]).includes(s)
}

/**
 * Config resolved from a stored intent. Each field is independent — the
 * creator can request just a proof, just attributes, both, or neither.
 *
 * `class` and `schema` accept multiple values for multi-schema asks. The
 * wizard validates attrs against the union of all schemas but writes only
 * the FIRST class value + schema URI to chain, since ENS text records are
 * single strings and downstream verifiers parse them as such.
 */
export interface IncomingConfig {
  prefillName: string | null
  requiredPlatforms: Platform[]
  optionalPlatforms: Platform[]
  platformsRequested: boolean
  requiredAttrs: string[]
  optionalAttrs: string[]
  classValues: string[]
  schemaUris: string[]
}

export function adaptIntentConfig(config: IntentConfig): IncomingConfig {
  const requiredPlatforms = config.requiredPlatforms.filter(isPlatform)
  const optionalPlatforms = config.optionalPlatforms.filter(isPlatform)
  return {
    prefillName: config.name,
    requiredPlatforms,
    optionalPlatforms,
    platformsRequested: requiredPlatforms.length + optionalPlatforms.length > 0,
    requiredAttrs: config.required,
    optionalAttrs: config.optional.filter((k) => !config.required.includes(k)),
    classValues: config.classValues,
    schemaUris: config.schemaUris,
  }
}

/**
 * Build a key → display label map used by both compose and preview so the
 * user sees consistent naming across screens without either duplicating the
 * schema-lookup logic.
 */
export function buildKeyLabels(
  schema: FetchedSchema | null,
  config: IncomingConfig,
): Record<string, string> {
  const allKeys = [...config.requiredAttrs, ...config.optionalAttrs]
  return Object.fromEntries(
    allKeys.map((key) => {
      const title = schema?.properties?.[key]?.title
      return [key, title ?? formatKeyName(key)]
    }),
  )
}
