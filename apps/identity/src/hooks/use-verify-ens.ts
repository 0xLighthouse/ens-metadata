'use client'

import { useWeb3 } from '@/contexts/Web3Provider'
import { createSession } from '@/lib/attester-client'
import { getOwnedNames, resolveOwner } from '@/lib/ens'
import { shortAddress } from '@/lib/utils'
import { useWizardStore } from '@/stores/wizard'
import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useMemo, useState } from 'react'

export type EnsPhase = 'idle' | 'checking-owner' | 'creating-session'

/**
 * Owns the "which ENS name are we operating on" handshake:
 * draft input → owner check → attester session → commit to store.
 *
 * Transient UI state (draft, phase, error, owned-names autocomplete) stays in
 * the hook. The hook commits to the store only when ownership is proven and
 * a session has been minted.
 */
export function useVerifyEns() {
  const { publicClient } = useWeb3()
  const { user } = usePrivy()
  const address = user?.wallet?.address as `0x${string}` | undefined

  const ensName = useWizardStore((s) => s.ensName)
  const confirmed = useWizardStore((s) => s.sessionId !== null && s.nonce !== null)
  const confirmEns = useWizardStore((s) => s.confirmEns)
  const resetForm = useWizardStore((s) => s.resetForm)

  const [draftName, setDraftName] = useState(ensName)
  const [phase, setPhase] = useState<EnsPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [ownedNames, setOwnedNames] = useState<string[]>([])

  // Keep draft in sync when the store-backed name changes externally (e.g.
  // persisted restore). We don't mirror user typing — `draftName` owns that.
  useEffect(() => {
    if (ensName && ensName !== draftName) setDraftName(ensName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensName])

  // Silent autocomplete: a subgraph failure just means no suggestions.
  useEffect(() => {
    if (!address) {
      setOwnedNames([])
      return
    }
    let cancelled = false
    getOwnedNames(publicClient, address).then((names) => {
      if (!cancelled) setOwnedNames(names)
    })
    return () => {
      cancelled = true
    }
  }, [address, publicClient])

  const filteredOwnedNames = useMemo(() => {
    const q = draftName.trim().toLowerCase()
    if (!q) return ownedNames
    return ownedNames.filter((n) => n.toLowerCase().includes(q))
  }, [draftName, ownedNames])

  const verify = async () => {
    setError(null)
    const trimmed = draftName.trim().toLowerCase()
    if (!trimmed) {
      setError('Enter your ENS name.')
      return
    }
    if (!trimmed.includes('.')) {
      setError("That doesn't look like a valid ENS name.")
      return
    }
    if (!address) {
      setError('Connect a wallet first.')
      return
    }
    try {
      setPhase('checking-owner')
      const owner = await resolveOwner(publicClient, trimmed)
      if (!owner) throw new Error(`Could not resolve owner for ${trimmed}.`)
      if (owner.toLowerCase() !== address.toLowerCase()) {
        throw new Error(
          `${trimmed} is managed by ${shortAddress(owner)}, but you're connected as ${shortAddress(
            address,
          )}. Did you pick the right wallet?`,
        )
      }
      setPhase('creating-session')
      const session = await createSession()
      confirmEns({ ensName: trimmed, sessionId: session.sessionId, nonce: session.nonce })
      setPhase('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('idle')
    }
  }

  const reset = () => {
    resetForm()
    setDraftName('')
    setError(null)
  }

  return {
    ensName,
    confirmed,
    draftName,
    setDraftName,
    phase,
    error,
    ownedNames: filteredOwnedNames,
    verify,
    reset,
  }
}
