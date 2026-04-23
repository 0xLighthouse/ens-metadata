'use client'

import { EMPTY_DIFF, type RecordDiff } from '@/lib/record-diff'
import type { AttestationProof, UnchangedRecord } from '@/lib/attestation-types'
import { createContext, useContext, useRef } from 'react'
import type { ReactNode } from 'react'
import { type StoreApi, createStore, useStore } from 'zustand'
import { persist } from 'zustand/middleware'

export type WizardScreen = 'compose' | 'preview'

export interface WizardState {
  // Persisted (see `partialize` below) — survives reloads and the OAuth round-trip.
  ensName: string
  sessionId: string | null
  nonce: string | null
  attrsValues: Record<string, string>

  // Ephemeral — regenerated every publish attempt, cleared when the session is
  // rotated or when navigating back to compose.
  screen: WizardScreen
  proofs: AttestationProof[]
  recordDiff: RecordDiff
  unchangedRecords: UnchangedRecord[]

  // `persist` is async; gate UI on this rather than a manual sentinel.
  hasHydrated: boolean

  // Actions
  seedEnsName: (ensName: string) => void
  confirmEns: (args: { ensName: string; sessionId: string; nonce: string }) => void
  clearSession: () => void
  resetForm: () => void
  setAttrValue: (key: string, value: string) => void
  setAttrsValues: (values: Record<string, string>) => void
  commitAttestation: (
    proofs: AttestationProof[],
    recordDiff: RecordDiff,
    unchangedRecords: UnchangedRecord[],
  ) => void
  backToCompose: () => void
  setHasHydrated: (value: boolean) => void
}

export function createWizardStore(intentId: string): StoreApi<WizardState> {
  return createStore<WizardState>()(
    persist(
      (set) => ({
        ensName: '',
        sessionId: null,
        nonce: null,
        attrsValues: {},

        screen: 'compose',
        proofs: [],
        recordDiff: EMPTY_DIFF,
        unchangedRecords: [],

        hasHydrated: false,

        // Only seed the name if nothing has been entered yet. Creator-provided
        // prefill loses to a user draft or a persisted value on purpose.
        seedEnsName: (ensName) => set((s) => (s.ensName ? s : { ensName })),

        confirmEns: ({ ensName, sessionId, nonce }) => set({ ensName, sessionId, nonce }),

        // Wipe every bit of state that was anchored to the old session. Proofs
        // bind to a specific SIWE resource set, so carrying them forward would
        // silently attest the wrong thing.
        clearSession: () =>
          set({
            sessionId: null,
            nonce: null,
            proofs: [],
            recordDiff: EMPTY_DIFF,
            unchangedRecords: [],
          }),

        // Full reset: clears the ENS name and every form entry in addition to
        // what clearSession touches. Used when the user changes ENS name or
        // disconnects the wallet — in both cases the old inputs no longer
        // belong to the new context.
        resetForm: () =>
          set({
            ensName: '',
            sessionId: null,
            nonce: null,
            attrsValues: {},
            proofs: [],
            recordDiff: EMPTY_DIFF,
            unchangedRecords: [],
            screen: 'compose',
          }),

        setAttrValue: (key, value) =>
          set((s) => ({ attrsValues: { ...s.attrsValues, [key]: value } })),

        setAttrsValues: (values) => set({ attrsValues: values }),

        commitAttestation: (proofs, recordDiff, unchangedRecords) =>
          set({ proofs, recordDiff, unchangedRecords, screen: 'preview' }),

        backToCompose: () => set({ screen: 'compose' }),

        setHasHydrated: (value) => set({ hasHydrated: value }),
      }),
      {
        name: `wizard:${intentId}`,
        partialize: (s) => ({
          ensName: s.ensName,
          sessionId: s.sessionId,
          nonce: s.nonce,
          attrsValues: s.attrsValues,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true)
        },
      },
    ),
  )
}

const WizardStoreContext = createContext<StoreApi<WizardState> | null>(null)

export function WizardProvider({
  intentId,
  children,
}: {
  intentId: string
  children: ReactNode
}) {
  // useRef (not useState) keeps the store stable across re-renders without
  // risking a double-create in React 18 strict mode.
  const storeRef = useRef<StoreApi<WizardState> | null>(null)
  if (!storeRef.current) {
    storeRef.current = createWizardStore(intentId)
  }
  return (
    <WizardStoreContext.Provider value={storeRef.current}>{children}</WizardStoreContext.Provider>
  )
}

export function useWizardStore<T>(selector: (state: WizardState) => T): T {
  const store = useContext(WizardStoreContext)
  if (!store) throw new Error('useWizardStore must be used inside <WizardProvider>')
  return useStore(store, selector)
}

export function useWizardStoreApi(): StoreApi<WizardState> {
  const store = useContext(WizardStoreContext)
  if (!store) throw new Error('useWizardStoreApi must be used inside <WizardProvider>')
  return store
}
