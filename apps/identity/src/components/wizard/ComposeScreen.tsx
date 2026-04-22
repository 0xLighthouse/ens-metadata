'use client'

import { GuidedCard, GuidedSection } from '@/components/ui/GuidedCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWeb3 } from '@/contexts/Web3Provider'
import { useAttestationFlow } from '@/hooks/use-attestation-flow'
import { useRecordsPrefill } from '@/hooks/use-records-prefill'
import { type Platform, useSocialAccounts } from '@/hooks/use-social-accounts'
import { useVerifyEns } from '@/hooks/use-verify-ens'
import type { FetchedSchema } from '@/lib/schema-resolver'
import type { PrivyTelegramAccount } from '@/lib/telegram-proof'
import type { PrivyTwitterAccount } from '@/lib/twitter-proof'
import { cn, shortAddress } from '@/lib/utils'
import { useWizardStore } from '@/stores/wizard'
import type { IntentConfig } from '@ensmetadata/shared/intent'
import { usePrivy } from '@privy-io/react-auth'
import {
  AlertCircle,
  CheckCircle2,
  FileSignature,
  HelpCircle,
  Wallet,
  X as XIcon,
} from 'lucide-react'
import type { ChangeEvent, TextareaHTMLAttributes } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

interface Props {
  config: IntentConfig
  schema: FetchedSchema | null
  keyLabels: Record<string, string>
}

export function ComposeScreen({ config, schema, keyLabels }: Props) {
  const {
    required: requiredAttrs,
    optional: optionalAttrs,
    classValues,
    schemaUris,
    requiredPlatforms,
    optionalPlatforms,
  } = config
  const classValue = classValues[0]
  const schemaUri = schemaUris[0]
  const platformsRequested = requiredPlatforms.length + optionalPlatforms.length > 0

  const { login, logout, authenticated, user, ready } = usePrivy()
  const { walletClient, isInitialized } = useWeb3()
  const address = user?.wallet?.address as `0x${string}` | undefined

  const attrsValues = useWizardStore((s) => s.attrsValues)
  const setAttrValue = useWizardStore((s) => s.setAttrValue)

  const ens = useVerifyEns()
  const socials = useSocialAccounts()

  // Union of every text-record key we care about: form attrs plus the
  // structural class/schema, which we read to compare against the submission
  // but never display as form inputs.
  const requestedAttrs = useMemo(
    () => [...requiredAttrs, ...optionalAttrs],
    [requiredAttrs, optionalAttrs],
  )
  const requiredSet = useMemo(() => new Set(requiredAttrs), [requiredAttrs])
  const allKeys = useMemo(() => {
    const keys = [...requestedAttrs]
    if (classValue) keys.push('class')
    if (schemaUri) keys.push('schema')
    return [...new Set(keys)]
  }, [requestedAttrs, classValue, schemaUri])

  const { loadedRecords, loadError, attrsLoaded } = useRecordsPrefill({
    allKeys,
    requestedAttrs,
  })

  const attestation = useAttestationFlow({
    loadedRecords,
    requestedAttrs,
    classValue,
    schemaUri,
    twitter: socials.twitter,
    telegram: socials.telegram,
  })

  const missingRequiredAttrs = useMemo(() => {
    return requiredAttrs.filter((k) => {
      const v = attrsValues[k]
      return typeof v !== 'string' || v.trim().length === 0
    })
  }, [requiredAttrs, attrsValues])

  // Which platforms to show. Required ∪ optional; if neither is specified,
  // fall back to the full catalog (the default "proof-only" flow).
  const visiblePlatforms: Platform[] = useMemo(() => {
    const specified = [...requiredPlatforms, ...optionalPlatforms]
    if (specified.length > 0) return Array.from(new Set(specified))
    return platformsRequested ? [] : ['com.x', 'org.telegram']
  }, [requiredPlatforms, optionalPlatforms, platformsRequested])

  const allRequiredLinked = requiredPlatforms.every(socials.isLinked)

  const canCreate =
    ens.confirmed &&
    !!walletClient &&
    !!address &&
    missingRequiredAttrs.length === 0 &&
    allRequiredLinked &&
    attrsLoaded &&
    !attestation.isSigning

  const previewLabel = (() => {
    switch (attestation.signPhase) {
      case 'awaiting-siwe':
        return 'Waiting for signature…'
      case 'binding':
        return 'Linking accounts…'
      case 'attesting':
        return 'Generating attestation…'
      default:
        return socials.anyLinked ? 'Prepare attestation and preview changes' : 'Preview changes'
    }
  })()

  return (
    <div className="space-y-6">
      <GuidedCard>
        <GuidedSection
          number="01"
          title="Your wallet & ENS name"
          description="Connect the wallet that owns or manages the ENS name you want to update."
          active
          accent="green"
        >
          <div className="space-y-4">
            {!authenticated ? (
              <Button onClick={login} disabled={!ready} full>
                <Wallet className="mr-2 h-4 w-4" />
                Connect wallet
              </Button>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
                <div className="min-w-0 text-sm">
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">Connected</div>
                  <div className="font-mono text-neutral-900 dark:text-neutral-100">
                    {shortAddress(address)}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={logout} disabled={attestation.isSigning}>
                  Disconnect
                </Button>
              </div>
            )}

            {authenticated &&
              (ens.confirmed ? (
                <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
                  <div className="min-w-0 text-sm">
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">ENS name</div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                      <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
                        {ens.ensName}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={ens.reset}
                    disabled={attestation.isSigning}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <EnsVerification ens={ens} disabled={!isInitialized} />
              ))}

            {ens.error && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{ens.error}</span>
              </div>
            )}
          </div>
        </GuidedSection>

        {requestedAttrs.length > 0 && (
          <GuidedSection
            number="02"
            title={
              classValue === 'Person'
                ? 'Your personal profile'
                : classValue === 'Organization'
                  ? "Your organization's profile"
                  : 'Your profile'
            }
            active={ens.confirmed}
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
                const isRequired = requiredSet.has(key)
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
        )}

        {visiblePlatforms.length > 0 && (
          <GuidedSection
            number={requestedAttrs.length > 0 ? '03' : '02'}
            title="Social accounts"
            description="Link the accounts you want to attest. Required accounts must be linked before you can continue."
            active={ens.confirmed}
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
        )}
      </GuidedCard>

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
              : !allRequiredLinked
                ? 'Link your required accounts to continue.'
                : null}
          </p>
        )}
      </div>
    </div>
  )
}

// -----------------------------
// ENS confirm form (draft input + autocomplete)
// -----------------------------

function EnsVerification({
  ens,
  disabled,
}: {
  ens: ReturnType<typeof useVerifyEns>
  disabled: boolean
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const inFlight = ens.phase !== 'idle'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        ens.verify()
      }}
      className="space-y-2"
    >
      <Label htmlFor="ens-name">ENS name</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="ens-name"
            placeholder="alice.eth"
            value={ens.draftName}
            onChange={(e) => {
              ens.setDraftName(e.target.value)
              setDropdownOpen(true)
            }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setDropdownOpen(false)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            disabled={disabled || inFlight}
            role="combobox"
            aria-expanded={dropdownOpen && ens.ownedNames.length > 0}
            aria-autocomplete="list"
          />
          {dropdownOpen && ens.ownedNames.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
            >
              {ens.ownedNames.map((n) => (
                <li key={n} role="option" aria-selected={n === ens.draftName}>
                  <button
                    type="button"
                    // onMouseDown + preventDefault keeps the input focused so
                    // onBlur doesn't close the dropdown before the selection
                    // registers.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      ens.setDraftName(n)
                      setDropdownOpen(false)
                    }}
                    className="block w-full truncate px-3 py-1.5 text-left font-mono text-sm text-neutral-900 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
                  >
                    {n}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button
          type="submit"
          disabled={disabled || !ens.draftName.trim() || inFlight}
          isLoading={inFlight}
        >
          {ens.phase === 'checking-owner'
            ? 'Checking…'
            : ens.phase === 'creating-session'
              ? 'Opening…'
              : 'Confirm'}
        </Button>
      </div>
    </form>
  )
}

// -----------------------------
// Platform row
// -----------------------------

function PlatformRow({
  platform,
  required,
  twitter,
  telegram,
  onLink,
  onUnlink,
  disconnecting,
  disabled,
}: {
  platform: Platform
  required: boolean
  twitter: PrivyTwitterAccount | null
  telegram: PrivyTelegramAccount | null
  onLink: () => void
  onUnlink: () => void
  disconnecting: boolean
  disabled: boolean
}) {
  const label = platform === 'com.x' ? 'X.com' : 'Telegram'
  const linked = platform === 'com.x' ? !!twitter : !!telegram
  const handle = platform === 'com.x' ? (twitter?.username ?? null) : (telegram?.username ?? null)
  const avatarUrl =
    platform === 'com.x' ? (twitter?.profilePictureUrl ?? null) : (telegram?.photoUrl ?? null)
  const helperText =
    platform === 'com.x'
      ? 'Log in to X and approve access. Only your X handle will be made public. No other data will be stored or shared.'
      : 'Log in to Telegram and approve access. Your account must have a public @username. Only your username will be made public. No other data will be stored or shared.'
  const initial = (handle ?? label).charAt(0).toUpperCase()

  return (
    <div
      className={cn(
        'flex flex-col gap-3 px-4 py-4 transition-colors sm:flex-row sm:items-center sm:gap-4',
        linked && 'bg-green-50/60 dark:bg-green-950/20',
      )}
    >
      <div className="sm:w-28 sm:shrink-0">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{label}</div>
        <div className="mt-1">
          {linked ? (
            <span className="inline-block rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-700 dark:bg-green-900/50 dark:text-green-300">
              Connected
            </span>
          ) : (
            <span
              className={cn(
                'inline-block rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
                !required && 'invisible',
              )}
              aria-hidden={!required}
            >
              Required
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {linked ? (
          <div className="flex items-center justify-center gap-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={handle ? `@${handle}` : `${label} avatar`}
                className="h-8 w-8 rounded-full border border-neutral-200 object-cover dark:border-neutral-700"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                {initial}
              </div>
            )}
            <span className="truncate font-mono text-sm text-neutral-900 dark:text-neutral-100">
              {handle ? `@${handle}` : 'connected'}
            </span>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            {helperText}
          </p>
        )}
      </div>

      <div className="sm:shrink-0">
        {linked ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onUnlink}
            disabled={disabled}
            isLoading={disconnecting}
          >
            {!disconnecting && <XIcon className="mr-1 h-3.5 w-3.5" />}
            Unlink
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onLink} disabled={disabled}>
            Link {platform === 'com.x' ? 'X' : 'Telegram'}
          </Button>
        )}
      </div>
    </div>
  )
}

// -----------------------------
// Auto-grow input
// -----------------------------

type AutoGrowInputProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value'
> & {
  value: string
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
}

// Textarea styled to match `<Input>` but grows vertically with its content.
function AutoGrowInput({ value, onChange, className, ...props }: AutoGrowInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={onChange}
      className={cn(
        'flex min-h-9 w-full min-w-0 resize-none overflow-hidden rounded-md border border-neutral-200 bg-transparent px-3 py-[0.4375rem] text-base leading-snug shadow-xs outline-none transition-[color,box-shadow] placeholder:text-neutral-500 selection:bg-neutral-900 selection:text-neutral-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-neutral-950 focus-visible:ring-neutral-950/50 focus-visible:ring-[3px]',
        'dark:border-neutral-800 dark:bg-neutral-200/30 dark:placeholder:text-neutral-400 dark:selection:bg-neutral-50 dark:selection:text-neutral-900 dark:focus-visible:border-neutral-300 dark:focus-visible:ring-neutral-300/50 dark:dark:bg-neutral-800/30',
        className,
      )}
      {...props}
    />
  )
}

// -----------------------------
// Helpers
// -----------------------------

function HelpTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label="Show description"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-20 mt-2 w-64 rounded-md border border-neutral-200 bg-white p-3 text-xs font-normal leading-snug text-neutral-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
        >
          {text}
        </span>
      )}
    </span>
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
