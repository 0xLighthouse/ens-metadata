'use client'

import { useWeb3 } from '@/contexts/Web3Provider'
import { metadataReader } from '@ensmetadata/sdk'
import { useEffect, useState } from 'react'

export interface TextRecordsResult {
  /** Map from key → on-chain value. `null` for a given key means the record
   *  isn't set. `null` as the outer value means "not loaded yet"; `{}` means
   *  the fetch failed (inspect `error`). */
  records: Record<string, string | null> | null
  error: string | null
  loaded: boolean
}

/**
 * Read a set of ENS text records for one name. Pure fetch — no store mutation,
 * no form concerns. Callers compose prefill / diff / display themselves.
 *
 * Pass `ensName = null` to gate the fetch (e.g. until a session is confirmed).
 * `keys` should be memoized by the caller — reference changes retrigger the
 * fetch.
 */
export function useTextRecords(ensName: string | null, keys: readonly string[]): TextRecordsResult {
  const { publicClient } = useWeb3()
  const [records, setRecords] = useState<Record<string, string | null> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ensName || !publicClient || keys.length === 0) {
      setRecords(null)
      setError(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const reader = metadataReader()(publicClient)
        const result = await reader.getMetadata({ name: ensName, keys: [...keys] })
        if (cancelled) return
        setRecords(result.properties as Record<string, string | null>)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setRecords({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [publicClient, ensName, keys])

  return { records, error, loaded: records !== null }
}
