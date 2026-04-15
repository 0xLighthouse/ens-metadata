'use client'

import type { DraftFullProof as DraftTelegramProof } from '@/lib/telegram-proof'
import type { DraftFullProof as DraftTwitterProof } from '@/lib/twitter-proof'
import { useEffect, useState } from 'react'
import { ConnectTelegramStep } from './ConnectTelegramStep'
import { ConnectTwitterStep } from './ConnectTwitterStep'
import { ConnectWalletStep } from './ConnectWalletStep'
import { ReviewStep } from './ReviewStep'
import { WizardStepIndicator } from './WizardStepIndicator'

// The two draft types are structurally similar (same inner claim shape,
// different `proof` payload). ReviewStep only reads the inner claim, so
// the union is enough — it doesn't need to discriminate the proof field.
export type AnyDraftFullProof = DraftTwitterProof | DraftTelegramProof

type Platform = 'com.x' | 'org.telegram'

const STEPS = ['Connect wallet', 'Connect account', 'Review and write']
const STORAGE_KEY = 'proofs-wizard-state'

// Privy's OAuth/login flows redirect the full page, so wizard state must
// survive a reload. We persist step + name + sessionId + platform to
// sessionStorage; draft isn't persisted because it's rebuilt from
// Privy's user.{twitter,telegram} on re-entry to step 1.
interface PersistedState {
  step: number
  name: string
  sessionId: string | null
  platform: Platform
}

function loadPersisted(): PersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (typeof parsed.step !== 'number' || typeof parsed.name !== 'string') return null
    return {
      // Never resume into the review step — draft is ephemeral and won't exist.
      step: Math.min(parsed.step, 1),
      name: parsed.name,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      platform: parsed.platform === 'org.telegram' ? 'org.telegram' : 'com.x',
    }
  } catch {
    return null
  }
}

export function Wizard() {
  const [hydrated, setHydrated] = useState(false)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [platform, setPlatform] = useState<Platform>('com.x')
  const [draft, setDraft] = useState<AnyDraftFullProof | null>(null)

  useEffect(() => {
    const persisted = loadPersisted()
    if (persisted) {
      setStep(persisted.step)
      setName(persisted.name)
      setSessionId(persisted.sessionId)
      setPlatform(persisted.platform)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ step, name, sessionId, platform } satisfies PersistedState),
    )
  }, [hydrated, step, name, sessionId, platform])

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
        <div className="space-y-4">
          {/* Platform picker — small button group above the link card. */}
          <div className="flex gap-2 max-w-xl mx-auto">
            <button
              type="button"
              onClick={() => setPlatform('com.x')}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                platform === 'com.x'
                  ? 'border-neutral-900 bg-neutral-900 text-neutral-50 dark:border-neutral-50 dark:bg-neutral-50 dark:text-neutral-900'
                  : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
              }`}
            >
              X
            </button>
            <button
              type="button"
              onClick={() => setPlatform('org.telegram')}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                platform === 'org.telegram'
                  ? 'border-neutral-900 bg-neutral-900 text-neutral-50 dark:border-neutral-50 dark:bg-neutral-50 dark:text-neutral-900'
                  : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
              }`}
            >
              Telegram
            </button>
          </div>

          {platform === 'com.x' && (
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
          {platform === 'org.telegram' && (
            <ConnectTelegramStep
              name={name}
              sessionId={sessionId}
              onBack={() => setStep(0)}
              onComplete={(next) => {
                setDraft(next)
                setStep(2)
              }}
            />
          )}
        </div>
      )}

      {step === 2 && draft && sessionId && (
        <ReviewStep name={name} draft={draft} sessionId={sessionId} onBack={() => setStep(1)} />
      )}
    </div>
  )
}
