import type { Schema } from '@ensmetadata/schemas/types'
import type { PublicClient } from 'viem'
import { readTextRecordsStrict } from './read-helpers'
import { type SchemaFetcherOptions, fetchSchemaByUri } from './schema-fetch'

export type SchemaSource = 'payload' | 'ens' | 'none'

export interface ResolveSchemaOptions {
  client: PublicClient
  name: string
  /** Schema URI carried in the inbound payload, if any. */
  payloadSchemaUri?: string | null
  /**
   * Pre-fetched value of the `schema` text record, if the caller already
   * read it (avoids a duplicate getEnsText). `undefined` = not provided →
   * SDK reads it strictly. `null`/`''` = caller confirms no record set.
   */
  ensSchemaText?: string | null
  /** Forwarded to `fetchSchemaByUri`. */
  ipfsGateway?: string
  localResolver?: SchemaFetcherOptions['localResolver']
  timeoutMs?: number
}

export interface ResolvedSchema {
  schema: Schema | null
  source: SchemaSource
  uri: string | null
}

/**
 * Resolve the schema to validate a payload against, following the cascade:
 *  1. If `payloadSchemaUri` non-empty → fetch it (hard-fail on any error).
 *  2. Else if `ensSchemaText` provided → use as URI (or `null`/`''` → none).
 *  3. Else → read the `schema` text record off ENS strictly.
 *  4. If a URI was found from ENS → fetch it (hard-fail on any error).
 *  5. No URI anywhere → `{source: 'none', uri: null, schema: null}`.
 */
export async function resolveSchemaForName(opts: ResolveSchemaOptions): Promise<ResolvedSchema> {
  const fetchOpts: SchemaFetcherOptions = {
    ...(opts.ipfsGateway !== undefined ? { ipfsGateway: opts.ipfsGateway } : {}),
    ...(opts.localResolver !== undefined ? { localResolver: opts.localResolver } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  }

  const payloadUri =
    typeof opts.payloadSchemaUri === 'string' && opts.payloadSchemaUri.length > 0
      ? opts.payloadSchemaUri
      : null

  if (payloadUri) {
    const schema = await fetchSchemaByUri(payloadUri, fetchOpts)
    return { schema, source: 'payload', uri: payloadUri }
  }

  let ensUri: string | null
  if (opts.ensSchemaText !== undefined) {
    ensUri =
      typeof opts.ensSchemaText === 'string' && opts.ensSchemaText.length > 0
        ? opts.ensSchemaText
        : null
  } else {
    try {
      const records = await readTextRecordsStrict({
        client: opts.client,
        name: opts.name,
        keys: ['schema'],
      })
      ensUri = records.schema ?? null
    } catch (err) {
      throw new Error(
        `Failed to read 'schema' text record from ENS for ${opts.name}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (!ensUri) {
    return { schema: null, source: 'none', uri: null }
  }

  const schema = await fetchSchemaByUri(ensUri, fetchOpts)
  return { schema, source: 'ens', uri: ensUri }
}
