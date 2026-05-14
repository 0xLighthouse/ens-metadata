import type { Schema } from '@ensmetadata/schemas/types'
/**
 * CLI-side schema cascade: pick the schema document to validate a payload
 * against. The SDK provides the on-chain part (`metadataReader.getSchema`)
 * but only knows about ENS — the CLI also lets callers ship a schema URI
 * in the payload file itself, which is the first step of the cascade.
 *
 *   1. Payload's own `schema` field set → fetch it.
 *   2. Caller pre-supplied the ENS `schema` text record → use that URI.
 *   3. Otherwise read the `schema` text record off ENS via the reader.
 *   4. Empty in all sources → `{ schema: null, source: 'none', uri: null }`.
 */
import { type SchemaResolver, fetchSchema, metadataReader } from '@ensmetadata/sdk'
import type { Address, PublicClient } from 'viem'

export type SchemaSource = 'payload' | 'ens' | 'none'

export interface ResolvedSchema {
  schema: Schema | null
  source: SchemaSource
  uri: string | null
}

export interface ResolveSchemaOptions {
  client: PublicClient
  name: string
  /** Schema URI carried in the inbound payload, if any. */
  payloadSchemaUri?: string | null
  /**
   * Pre-fetched value of the `schema` text record. `undefined` → fetch
   * from ENS. Empty string / `null` → caller confirms no record set.
   */
  ensSchemaText?: string | null
  /** Forwarded to `fetchSchema`. */
  gateway?: string
  resolver?: SchemaResolver
  timeoutMs?: number
  /** ENS registry for direct lookups (forwarded to the SDK reader). */
  registry?: Address
}

export async function resolveSchemaForName(opts: ResolveSchemaOptions): Promise<ResolvedSchema> {
  const fetchOpts: Parameters<typeof fetchSchema>[1] = {
    ...(opts.gateway !== undefined ? { gateway: opts.gateway } : {}),
    ...(opts.resolver !== undefined ? { resolver: opts.resolver } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  }

  const payloadUri =
    typeof opts.payloadSchemaUri === 'string' && opts.payloadSchemaUri.length > 0
      ? opts.payloadSchemaUri
      : null

  if (payloadUri) {
    const schema = await fetchSchema(payloadUri, fetchOpts)
    return { schema, source: 'payload', uri: payloadUri }
  }

  let ensUri: string | null
  if (opts.ensSchemaText !== undefined) {
    ensUri =
      typeof opts.ensSchemaText === 'string' && opts.ensSchemaText.length > 0
        ? opts.ensSchemaText
        : null
  } else {
    const reader = metadataReader()(opts.client)
    try {
      const info = await reader.getSchema({
        name: opts.name,
        ...(opts.registry ? { registry: opts.registry } : {}),
      })
      ensUri = info.properties.schema ?? null
    } catch (err) {
      throw new Error(
        `Failed to read 'schema' text record from ENS for ${opts.name}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (!ensUri) {
    return { schema: null, source: 'none', uri: null }
  }

  const schema = await fetchSchema(ensUri, fetchOpts)
  return { schema, source: 'ens', uri: ensUri }
}
