'use client'

import { useWeb3 } from '@/contexts/Web3Provider'
import { useWizardStore, useWizardStoreApi } from '@/stores/wizard'
import { metadataReader } from '@ensmetadata/sdk'
import { useEffect, useState } from 'react'

interface Args {
  /** Union of every text-record key we want to read (attrs + class + schema). */
  allKeys: string[]
  /** Keys the form exposes as inputs. Used to decide which loaded values should
   *  pre-fill the form — class/schema load but don't pre-fill. */
  requestedAttrs: string[]
}

/**
 * Loads existing text records for the confirmed ENS name and pre-fills any
 * empty attribute inputs with what's already on chain. Runs exactly once
 * per confirmed session — we don't re-fetch on keystrokes.
 */
export function useRecordsPrefill({ allKeys, requestedAttrs }: Args) {
  const { publicClient } = useWeb3()
  const ensName = useWizardStore((s) => s.ensName)
  const confirmed = useWizardStore((s) => s.sessionId !== null)
  const storeApi = useWizardStoreApi()

  const [loadedRecords, setLoadedRecords] = useState<Record<string, string | null> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!confirmed || !publicClient || allKeys.length === 0 || !ensName) {
      if (!confirmed) {
        setLoadedRecords(null)
        setLoadError(null)
      }
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const reader = metadataReader()(publicClient)
        const result = await reader.getMetadata({ name: ensName, keys: allKeys })
        if (cancelled) return
        const properties = result.properties as Record<string, string | null>
        setLoadedRecords(properties)

        // Pre-fill any empty inputs. Read attrsValues imperatively so the
        // effect doesn't retrigger on every keystroke.
        const currentAttrs = storeApi.getState().attrsValues
        const nextValues = { ...currentAttrs }
        let changed = false
        for (const key of requestedAttrs) {
          const existing = properties[key]
          if (typeof existing === 'string' && existing && !nextValues[key]) {
            nextValues[key] = existing
            changed = true
          }
        }
        if (changed) storeApi.getState().setAttrsValues(nextValues)
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
        setLoadedRecords({})
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, publicClient, ensName, allKeys])

  return {
    loadedRecords,
    loadError,
    attrsLoaded: loadedRecords !== null,
  }
}
