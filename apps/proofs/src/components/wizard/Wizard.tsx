'use client'

import type { DraftFullProof } from '@/lib/twitter-proof'
import { useEffect, useState } from 'react'
import { ConnectTwitterStep } from './ConnectTwitterStep'
import { ConnectWalletStep } from './ConnectWalletStep'
import { ReviewStep } from './ReviewStep'
import { WizardStepIndicator } from './WizardStepIndicator'

const STEPS = ['Connect wallet', 'Connect Twitter', 'Review and write']
const STORAGE_KEY = 'proofs-wizard-state'

// Privy's Twitter OAuth redirects the full page, so wizard state must survive
// a reload. We persist step + name to sessionStorage; draft isn't persisted
// because it's rebuilt from Privy's user.twitter on re-entry to step 1.
interface PersistedState {
  step: number
  name: string
}

function loadPersisted(): PersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (typeof parsed.step !== 'number' || typeof parsed.name !== 'string') return null
    // Never resume into the review step — draft is ephemeral and won't exist.
    return { step: Math.min(parsed.step, 1), name: parsed.name }
  } catch {
    return null
  }
}

export function Wizard() {
  // Initialize with defaults so server and first client render match.
  // Hydrate from sessionStorage in an effect after mount.
  const [hydrated, setHydrated] = useState(false)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [draft, setDraft] = useState<DraftFullProof | null>(null)

  useEffect(() => {
    const persisted = loadPersisted()
    if (persisted) {
      setStep(persisted.step)
      setName(persisted.name)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step, name }))
  }, [hydrated, step, name])

  return (
    <div className="max-w-xl mx-auto w-full">
      <WizardStepIndicator steps={STEPS} current={step} />
      {step === 0 && (
        <ConnectWalletStep
          onComplete={(n) => {
            setName(n)
            setStep(1)
          }}
        />
      )}
      {step === 1 && (
        <ConnectTwitterStep
          name={name}
          onBack={() => setStep(0)}
          onComplete={(next) => {
            setDraft(next)
            setStep(2)
          }}
        />
      )}
      {step === 2 && draft && <ReviewStep name={name} draft={draft} onBack={() => setStep(1)} />}
    </div>
  )
}
