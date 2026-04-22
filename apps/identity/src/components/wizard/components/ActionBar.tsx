'use client'

import { Button } from '@/components/ui/button'
import { AlertCircle, FileSignature } from 'lucide-react'
import { useCompose } from '../ComposeContext'

/** Bottom action: submit button + signing-flow errors + "what's missing" hint. */
export function ActionBar() {
  const {
    canCreate,
    attestation,
    previewLabel,
    ens,
    missingRequiredAttrs,
    requiredAccountsLinked,
    keyLabels,
  } = useCompose()

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <Button
        full
        onClick={attestation.createAttestation}
        disabled={!canCreate}
        isLoading={attestation.isSigning}
      >
        {attestation.signPhase === 'awaiting-siwe' ? (
          <>
            <FileSignature className="mr-2 h-4 w-4" />
            {previewLabel}
          </>
        ) : (
          previewLabel
        )}
      </Button>
      {attestation.signError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{attestation.signError}</span>
        </div>
      )}
      {!canCreate && ens.confirmed && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {missingRequiredAttrs.length > 0
            ? `Fill in required fields: ${missingRequiredAttrs
                .map((k) => keyLabels[k] ?? k)
                .join(', ')}.`
            : !requiredAccountsLinked
              ? 'Link your required accounts to continue.'
              : null}
        </p>
      )}
    </div>
  )
}
