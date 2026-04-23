'use client'

import { GuidedSection } from '@/components/ui/GuidedCard'
import { AlertCircle } from 'lucide-react'
import { useCompose } from '../ComposeContext'
import { PlatformRow } from './PlatformRow'

/** Section 03 (or 02 when no attrs requested): social account linking. */
export function PlatformsSection() {
  const {
    visiblePlatforms,
    requiredPlatforms,
    requestedAttrs,
    socials,
    attestation,
    ens,
    authenticated,
  } = useCompose()

  if (visiblePlatforms.length === 0) return null

  return (
    <GuidedSection
      number={requestedAttrs.length > 0 ? '03' : '02'}
      title="Social accounts"
      description="Link the accounts you want to attest. Required accounts must be linked before you can continue."
      active={authenticated && ens.confirmed}
      inactiveHint="Confirm your ENS name above to continue."
      accent="green"
    >
      <div className="space-y-3">
        <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {visiblePlatforms.map((p) => (
            <PlatformRow
              key={p}
              platform={p}
              required={requiredPlatforms.includes(p)}
              twitter={socials.twitter}
              telegram={socials.telegram}
              onLink={() => socials.link(p)}
              onUnlink={() => socials.unlink(p)}
              disconnecting={socials.disconnectingPlatform === p}
              disabled={attestation.isSigning}
            />
          ))}
        </div>
        {socials.linkError && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{socials.linkError}</span>
          </div>
        )}
      </div>
    </GuidedSection>
  )
}
