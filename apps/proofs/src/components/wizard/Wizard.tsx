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
// a reload. We persist step + name + sessionId to sessionStorage; draft isn't
// persisted because it's rebuilt from Privy's user.twitter on re-entry to
// step 1. The sessionId is what binds the two halves of the flow together
// — it points at the Durable Object on the worker that holds the SIWE wallet
// binding.
interface PersistedState {
  step: number
  name: string
  sessionId: string | null
}

function loadPersisted(): PersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (typeof parsed.step !== 'number' || typeof parsed.name !== 'string') return null
    // Never resume into the review step — draft is ephemeral and won't exist.
    return {
      step: Math.min(parsed.step, 1),
      name: parsed.name,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
    }
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
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftFullProof | null>(null)

  useEffect(() => {
    const persisted = loadPersisted()
    if (persisted) {
      setStep(persisted.step)
      setName(persisted.name)
      setSessionId(persisted.sessionId)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ step, name, sessionId } satisfies PersistedState),
    )
  }, [hydrated, step, name, sessionId])

  return (
    <div className="max-w-xl mx-auto w-full">
      <WizardStepIndicator steps={STEPS} current={step} />
      {step === 0 && (
        <ConnectWalletStep
          onComplete={(n, sid) => {
            setName(n)
            setSessionId(sid)
            setStep(1)
          }}
        />
      )}
      {step === 1 && sessionId && (
        <ConnectTwitterStep
          name={name}
          sessionId={sessionId}
          onBack={() => setStep(0)}
          onComplete={(next) => {
            setDraft(next)
            setStep(2)
          }}
        />
      )}
      {step === 2 && draft && sessionId && (
        <ReviewStep
          name={name}
          draft={draft}
          sessionId={sessionId}
          onBack={() => setStep(1)}
        />
      )}
    </div>
  )
}
