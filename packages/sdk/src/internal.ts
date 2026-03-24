import type { PublicClient } from 'viem'
import type { GetSchemaResult } from './types'

export function pickFirst(
  texts: Record<string, string | null>,
  candidates: string[],
): string | null {
  for (const key of candidates) {
    const value = texts[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

export function normalizeResolverAddress(resolver: unknown): string | null {
  if (!resolver) return null
  if (typeof resolver === 'string') return resolver
  if (typeof resolver === 'object' && resolver !== null && 'address' in resolver) {
    const address = (resolver as { address?: unknown }).address
    return typeof address === 'string' ? address : null
  }
  return null
}

export function buildTextOptions(opts: {
  blockNumber?: bigint
  blockTag?: string
  gatewayUrls?: string[]
  strict?: boolean
  universalResolverAddress?: string
}) {
  return {
    ...(opts.blockNumber !== undefined ? { blockNumber: opts.blockNumber } : {}),
    ...(opts.blockTag !== undefined ? { blockTag: opts.blockTag } : {}),
    ...(opts.gatewayUrls !== undefined ? { gatewayUrls: opts.gatewayUrls } : {}),
    ...(opts.strict !== undefined ? { strict: opts.strict } : {}),
    ...(opts.universalResolverAddress !== undefined
      ? { universalResolverAddress: opts.universalResolverAddress }
      : {}),
  }
}

export function extractSchemaFields(texts: Record<string, string | null>): GetSchemaResult {
  return {
    schema: pickFirst(texts, ['schema', 'ens.schema', 'record.schema']),
    class: pickFirst(texts, ['class', 'ens.class', 'record.class']),
    version: pickFirst(texts, ['schemaVersion', 'schema-version', 'version', 'record.version']),
    cid: pickFirst(texts, ['schemaCid', 'schema-cid', 'cid', 'record.cid']),
  }
}

declare function setTimeout(callback: () => void, ms: number): unknown

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  const timer = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
  return Promise.race([promise, timer]) as Promise<T | null>
}

export async function fetchTextRecords(
  client: PublicClient,
  normalizedName: string,
  keys: string[],
  textOptions: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<Record<string, string | null>> {
  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        const value = await withTimeout<string | null>(
          // biome-ignore lint/suspicious/noExplicitAny: ensjs extends PublicClient with getEnsText
          (client as any).getEnsText({ name: normalizedName, key, ...textOptions }),
          timeoutMs,
        )
        return [key, (value ?? null) as string | null] as const
      } catch {
        return [key, null] as const
      }
    }),
  )
  return Object.fromEntries(results)
}
