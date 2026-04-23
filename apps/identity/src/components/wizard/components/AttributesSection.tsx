'use client'

import { GuidedSection } from '@/components/ui/GuidedCard'
import { Label } from '@/components/ui/label'
import { useCompose } from '../ComposeContext'
import { AutoGrowInput } from './AutoGrowInput'
import { HelpTooltip } from './HelpTooltip'

/** Section 02: per-attribute form fields, with optional prefill warning when
 *  the on-chain read failed. */
export function AttributesSection() {
  const {
    requestedAttrs,
    requiredAttrSet,
    attrsValues,
    setAttrValue,
    schema,
    keyLabels,
    classValue,
    loadError,
    ens,
    authenticated,
  } = useCompose()

  if (requestedAttrs.length === 0) return null

  return (
    <GuidedSection
      number="02"
      title={
        classValue === 'Person'
          ? 'Your personal profile'
          : classValue === 'Organization'
            ? "Your organization's profile"
            : 'Your profile'
      }
      active={authenticated && ens.confirmed}
      inactiveHint="Confirm your ENS name above to continue."
      accent="green"
    >
      <div className="space-y-4">
        {loadError && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Couldn't load existing records (<span className="font-mono">{loadError}</span>).
            Submitting new values may overwrite existing data.
          </div>
        )}
        {requestedAttrs.map((key) => {
          const value = attrsValues[key] ?? ''
          const isRequired = requiredAttrSet.has(key)
          const prop = schema?.properties?.[key]
          const helpText = prop?.description
          const placeholder =
            (Array.isArray(prop?.examples) && typeof prop.examples[0] === 'string'
              ? (prop.examples[0] as string)
              : undefined) ?? placeholderFor(key)
          const label = keyLabels[key] ?? key
          return (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`attr-${key}`} className="flex items-center gap-2">
                <span>{label}</span>
                {isRequired && (
                  <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                    Required
                  </span>
                )}
                {helpText && <HelpTooltip text={helpText} />}
              </Label>
              <AutoGrowInput
                id={`attr-${key}`}
                value={value}
                onChange={(e) => setAttrValue(key, e.target.value)}
                placeholder={placeholder}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-required={isRequired}
              />
            </div>
          )
        })}
      </div>
    </GuidedSection>
  )
}

function placeholderFor(key: string): string {
  switch (key) {
    case 'avatar':
      return 'https://example.com/avatar.png  or  ipfs://...'
    case 'alias':
      return 'Alice Smith'
    case 'description':
      return 'A short bio'
    case 'email':
      return 'alice@example.com'
    case 'url':
      return 'https://alice.example'
    case 'phone':
      return '+1 555 555 5555'
    default:
      return ''
  }
}
