'use client'

import { Button } from '@/components/ui/button'
import { GuidedCard, GuidedSection } from '@/components/ui/GuidedCard'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWeb3 } from '@/contexts/Web3Provider'
import { attest, bindPlatform, bindWallet, createSession } from '@/lib/attester-client'
import { getOwnedNames, resolveOwner } from '@/lib/ens'
import { type RecordDiff, computeRecordDiff } from '@/lib/record-diff'
import {
  TELEGRAM_PLATFORM,
  type DraftFullProof as DraftTelegramProof,
  type PrivyTelegramAccount,
  buildTelegramProofFromPrivy,
} from '@/lib/telegram-proof'
import {
  TWITTER_PLATFORM,
  type DraftFullProof as DraftTwitterProof,
  type PrivyTwitterAccount,
  buildTwitterProofFromPrivy,
} from '@/lib/twitter-proof'
import type { FetchedSchema } from '@/lib/use-schema'
import { cn, shortAddress } from '@/lib/utils'
import { metadataReader } from '@ensmetadata/sdk'
import { getAccessToken, usePrivy, useWallets } from '@privy-io/react-auth'
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
import { createSiweMessage } from 'viem/siwe'

type Platform = 'com.x' | 'org.telegram'

export interface AttestationProof {
  draft: DraftTwitterProof | DraftTelegramProof
  claimHex: string
}

/** Schema-declared attributes that already hold the submitted value on
 *  chain, i.e. not part of the diff but still worth showing in the preview's
 *  clean view so the user sees their full post-publish profile. */
export interface UnchangedRecord {
  key: string
  value: string
}

type EnsPhase = 'idle' | 'checking-owner' | 'creating-session'
type SignPhase = 'idle' | 'awaiting-siwe' | 'binding' | 'attesting'

interface Props {
  name: string
  defaultName?: string
  sessionId: string | null
  nonce: string | null
  attrsValues: Record<string, string>
  requiredAttrs: string[]
  optionalAttrs: string[]
  classValue?: string
  schemaUri?: string
  schema: FetchedSchema | null
  keyLabels: Record<string, string>
  requiredPlatforms: Platform[]
  optionalPlatforms: Platform[]
  platformsRequested: boolean
  onNameChange: (next: string) => void
  onSessionChange: (sessionId: string | null, nonce: string | null) => void
  onAttrsChange: (values: Record<string, string>) => void
  onAttestation: (
    proofs: AttestationProof[],
    recordDiff: RecordDiff,
    unchanged: UnchangedRecord[],
  ) => void
}

export function ComposeScreen({
  name,
  defaultName,
  sessionId,
  nonce,
  attrsValues,
  requiredAttrs,
  optionalAttrs,
  classValue,
  schemaUri,
  schema,
  keyLabels,
  requiredPlatforms,
  optionalPlatforms,
  platformsRequested,
  onNameChange,
  onSessionChange,
  onAttrsChange,
  onAttestation,
}: Props) {
  const {
    login,
    logout,
    authenticated,
    user,
    ready,
    linkTwitter,
    linkTelegram,
    unlinkTwitter,
    unlinkTelegram,
  } = usePrivy()
  const { wallets } = useWallets()
  const { walletClient, publicClient, isInitialized } = useWeb3()

  const address = user?.wallet?.address as `0x${string}` | undefined

  // Privy exposes linked social accounts both as top-level convenience fields
  // (`user.twitter`, `user.telegram`) and inside `user.linkedAccounts`. They
  // should mirror each other, but we've seen cases where the convenience
  // field trails the array after OAuth completes — so we accept either.
  const twitter: PrivyTwitterAccount | null = useMemo(() => {
    if (user?.twitter) return user.twitter as PrivyTwitterAccount
    const entry = user?.linkedAccounts?.find(
      (a) => (a as { type?: string }).type === 'twitter_oauth',
    ) as (PrivyTwitterAccount & { type?: string }) | undefined
    return entry ?? null
  }, [user])

  const telegram: PrivyTelegramAccount | null = useMemo(() => {
    if (user?.telegram) return user.telegram as PrivyTelegramAccount
    const entry = user?.linkedAccounts?.find(
      (a) => (a as { type?: string }).type === 'telegram',
    ) as (PrivyTelegramAccount & { type?: string }) | undefined
    return entry ?? null
  }, [user])

  const confirmed = sessionId !== null && nonce !== null

  // --- Section 01: ENS confirmation ---
  const [draftName, setDraftName] = useState(
    name || defaultName || '',
  )
  const [ensPhase, setEnsPhase] = useState<EnsPhase>('idle')
  const [ensError, setEnsError] = useState<string | null>(null)
  const [ownedNames, setOwnedNames] = useState<string[]>([])
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)

  // Keep the draft in sync when parent-provided name changes (e.g. persisted restore).
  useEffect(() => {
    if (name && name !== draftName) setDraftName(name)
    // We only care about external name changes, not user edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  // Fetch the connected wallet's owned ENS names for autocomplete. Silent
  // fallback: a subgraph failure just means no suggestions, not an error.
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

  const handleConfirmEns = async () => {
    setEnsError(null)
    const trimmed = draftName.trim().toLowerCase()
    if (!trimmed) {
      setEnsError('Enter your ENS name.')
      return
    }
    if (!trimmed.includes('.')) {
      setEnsError("That doesn't look like a valid ENS name.")
      return
    }
    if (!address) {
      setEnsError('Connect a wallet first.')
      return
    }
    try {
      setEnsPhase('checking-owner')
      const owner = await resolveOwner(publicClient, trimmed)
      if (!owner) throw new Error(`Could not resolve owner for ${trimmed}.`)
      if (owner.toLowerCase() !== address.toLowerCase()) {
        throw new Error(
          `${trimmed} is managed by ${shortAddress(owner)}, but you're connected as ${shortAddress(
            address,
          )}. Did you pick the right wallet?`,
        )
      }
      setEnsPhase('creating-session')
      const session = await createSession()
      onNameChange(trimmed)
      onSessionChange(session.sessionId, session.nonce)
      setEnsPhase('idle')
    } catch (err) {
      setEnsError(err instanceof Error ? err.message : String(err))
      setEnsPhase('idle')
    }
  }

  const handleChangeEns = () => {
    onSessionChange(null, null)
    setEnsError(null)
  }

  // --- Section 02: on-chain pre-fill for attrs ---
  const allRequestedAttrs = useMemo(
    () => [...requiredAttrs, ...optionalAttrs],
    [requiredAttrs, optionalAttrs],
  )
  const requiredSet = useMemo(() => new Set(requiredAttrs), [requiredAttrs])
  const allKeys = useMemo(() => {
    const keys = [...allRequestedAttrs]
    if (classValue) keys.push('class')
    if (schemaUri) keys.push('schema')
    return [...new Set(keys)]
  }, [allRequestedAttrs, classValue, schemaUri])

  const [loadedRecords, setLoadedRecords] = useState<Record<string, string | null> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Load existing records once the session is confirmed. We only need them
  // to pre-fill the form and to diff against at publish time.
  useEffect(() => {
    if (!confirmed || !publicClient || allKeys.length === 0 || !name) {
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
        const result = await reader.getMetadata({ name, keys: allKeys })
        if (cancelled) return
        const properties = result.properties as Record<string, string | null>
        setLoadedRecords(properties)
        // Pre-fill empty inputs with what's already on chain.
        const nextValues = { ...attrsValues }
        let changed = false
        for (const key of allRequestedAttrs) {
          const existing = properties[key]
          if (typeof existing === 'string' && existing && !nextValues[key]) {
            nextValues[key] = existing
            changed = true
          }
        }
        if (changed) onAttrsChange(nextValues)
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
        setLoadedRecords({})
      }
    })()
    return () => {
      cancelled = true
    }
  // attrsValues intentionally omitted — we don't want to re-fetch on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, publicClient, name, allKeys])

  const missingRequiredAttrs = useMemo(() => {
    return requiredAttrs.filter((k) => {
      const v = attrsValues[k]
      return typeof v !== 'string' || v.trim().length === 0
    })
  }, [requiredAttrs, attrsValues])

  const setAttrValue = (key: string, value: string) => {
    onAttrsChange({ ...attrsValues, [key]: value })
  }

  // --- Section 03: social accounts ---
  // Which platforms to show. Required ∪ optional; if neither is specified,
  // fall back to the full catalog (the default "proof-only" flow).
  const visiblePlatforms: Platform[] = useMemo(() => {
    const specified = [...requiredPlatforms, ...optionalPlatforms]
    if (specified.length > 0) return Array.from(new Set(specified))
    return platformsRequested ? [] : ['com.x', 'org.telegram']
  }, [requiredPlatforms, optionalPlatforms, platformsRequested])

  const isLinked = (p: Platform) =>
    (p === 'com.x' && !!twitter) || (p === 'org.telegram' && !!telegram)
  const allRequiredLinked = requiredPlatforms.every(isLinked)

  const [linkError, setLinkError] = useState<string | null>(null)
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<Platform | null>(null)

  const handleLink = (p: Platform) => {
    setLinkError(null)
    try {
      if (p === 'com.x') linkTwitter()
      else linkTelegram()
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleUnlink = async (p: Platform) => {
    setDisconnectingPlatform(p)
    setLinkError(null)
    try {
      if (p === 'com.x' && twitter) await unlinkTwitter(twitter.subject)
      if (p === 'org.telegram' && telegram) await unlinkTelegram(telegram.telegramUserId)
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err))
    } finally {
      setDisconnectingPlatform(null)
    }
  }

  // --- Bottom action: create attestation + transition ---
  const [signPhase, setSignPhase] = useState<SignPhase>('idle')
  const [signError, setSignError] = useState<string | null>(null)
  const isSigning = signPhase !== 'idle'

  const anyLinked = !!twitter || !!telegram
  const attrsLoaded = loadedRecords !== null

  // Can the user create the attestation? They need a confirmed session, all
  // required attrs filled, all required accounts linked, and at least one
  // proof OR attribute change if nothing else. We let empty-everything slip
  // so the attester error bubbles up naturally if the user tries.
  const canCreate =
    confirmed &&
    !!walletClient &&
    !!address &&
    missingRequiredAttrs.length === 0 &&
    allRequiredLinked &&
    attrsLoaded &&
    !isSigning

  const handleCreateAttestation = async () => {
    if (!address || !walletClient) return
    if (telegram && !telegram.username) {
      setSignError(
        'Your Telegram account has no public @username. Set one and re-link.',
      )
      return
    }
    setSignError(null)

    try {
      let proofsOut: AttestationProof[] = []

      // Only run the SIWE+bind+attest flow when there's at least one social
      // to attest. With no linked accounts, there's nothing to sign for —
      // we just diff the attrs and go straight to preview.
      if (anyLinked) {
        // Mint a fresh session right before attestation. The wizard is
        // single-page now, so reusing the session from when the user confirmed
        // their ENS name only invites "session expired" errors when they sit
        // on the form too long.
        const session = await createSession()
        onSessionChange(session.sessionId, session.nonce)
        const freshSessionId = session.sessionId
        const freshNonce = session.nonce

        const issuer = wallets[0]?.address ?? address

        // SIWE message binds the signature to this ENS name + every linked
        // handle, so the attester can't be tricked into swapping in a
        // different account behind our back.
        const resources: string[] = [
          `ens:${name}`,
          ...(twitter ? [`social:${TWITTER_PLATFORM}:${twitter.username}`] : []),
          ...(telegram?.username ? [`social:${TELEGRAM_PLATFORM}:${telegram.username}`] : []),
        ]

        setSignPhase('awaiting-siwe')
        const message = createSiweMessage({
          address: issuer as `0x${string}`,
          chainId: publicClient?.chain?.id ?? 1,
          domain: window.location.host,
          nonce: freshNonce,
          uri: window.location.origin,
          version: '1',
          statement:
            'Sign this message to confirm your intent to link the resources listed below. This will not make any changes to your ENS profile.',
          resources,
          issuedAt: new Date(),
        })
        const signature = await walletClient.signMessage({
          account: issuer as `0x${string}`,
          message,
        })

        setSignPhase('binding')
        await bindWallet({ sessionId: freshSessionId, message, signature })
        const privyAccessToken = (await getAccessToken().catch(() => null)) ?? undefined
        await Promise.all([
          twitter
            ? bindPlatform({
                sessionId: freshSessionId,
                platform: TWITTER_PLATFORM,
                payload: {
                  privyAccessToken,
                  uid: twitter.subject,
                  handle: twitter.username,
                },
              })
            : null,
          telegram?.username
            ? bindPlatform({
                sessionId: freshSessionId,
                platform: TELEGRAM_PLATFORM,
                payload: {
                  privyAccessToken,
                  uid: telegram.telegramUserId,
                  handle: telegram.username,
                },
              })
            : null,
        ])

        setSignPhase('attesting')
        const result = await attest({ sessionId: freshSessionId, name })

        proofsOut = result.attestations.map((entry) => {
          if (entry.platform === TWITTER_PLATFORM && twitter) {
            return {
              draft: buildTwitterProofFromPrivy({
                twitter,
                issuerAddress: issuer as `0x${string}`,
                ensName: name,
              }),
              claimHex: entry.claimHex,
            }
          }
          if (entry.platform === TELEGRAM_PLATFORM && telegram) {
            return {
              draft: buildTelegramProofFromPrivy({
                telegram,
                issuerAddress: issuer as `0x${string}`,
                ensName: name,
              }),
              claimHex: entry.claimHex,
            }
          }
          throw new Error(`Unexpected attestation platform: ${entry.platform}`)
        })
      }

      // Build the attr diff (includes class/schema) so the preview screen
      // can render a proper add/update/remove view and the publish step can
      // write the right text records.
      const desired: Record<string, string> = { ...attrsValues }
      if (classValue) desired.class = classValue
      if (schemaUri) desired.schema = schemaUri
      const diff = computeRecordDiff(loadedRecords ?? {}, desired)

      // Schema-declared attrs whose on-chain value already matches the
      // submission (i.e. not in the diff) — shown in the preview's clean
      // view for a complete post-publish picture.
      const changedKeys = new Set<string>([
        ...diff.added.map((a) => a.key),
        ...diff.updated.map((u) => u.key),
        ...diff.removed.map((r) => r.key),
      ])
      const unchanged: UnchangedRecord[] = []
      for (const key of allRequestedAttrs) {
        if (changedKeys.has(key)) continue
        const existing = loadedRecords?.[key]
        if (typeof existing === 'string' && existing.length > 0) {
          unchanged.push({ key, value: existing })
        }
      }

      setSignPhase('idle')
      onAttestation(proofsOut, diff, unchanged)
    } catch (err) {
      setSignError(err instanceof Error ? err.message : String(err))
      setSignPhase('idle')
    }
  }

  const previewLabel = (() => {
    switch (signPhase) {
      case 'awaiting-siwe':
        return 'Waiting for signature…'
      case 'binding':
        return 'Linking accounts…'
      case 'attesting':
        return 'Generating attestation…'
      default:
        return anyLinked ? 'Prepare attestation and preview changes' : 'Preview changes'
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
                <Button variant="ghost" size="sm" onClick={logout} disabled={isSigning}>
                  Disconnect
                </Button>
              </div>
            )}

            {authenticated && (
              confirmed ? (
                <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
                  <div className="min-w-0 text-sm">
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      ENS name
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                      <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
                        {name}
                      </span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleChangeEns} disabled={isSigning}>
                    Change
                  </Button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleConfirmEns()
                  }}
                  className="space-y-2"
                >
                  <Label htmlFor="ens-name">ENS name</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="ens-name"
                        placeholder="alice.eth"
                        value={draftName}
                        onChange={(e) => {
                          setDraftName(e.target.value)
                          setNameDropdownOpen(true)
                        }}
                        onFocus={() => setNameDropdownOpen(true)}
                        onBlur={() => setNameDropdownOpen(false)}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        autoComplete="off"
                        disabled={!isInitialized || ensPhase !== 'idle'}
                        role="combobox"
                        aria-expanded={nameDropdownOpen && filteredOwnedNames.length > 0}
                        aria-autocomplete="list"
                      />
                      {nameDropdownOpen && filteredOwnedNames.length > 0 && (
                        <ul
                          role="listbox"
                          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
                        >
                          {filteredOwnedNames.map((n) => (
                            <li key={n} role="option" aria-selected={n === draftName}>
                              <button
                                type="button"
                                // onMouseDown (not onClick) + preventDefault keeps the
                                // input focused so onBlur doesn't close the dropdown
                                // before the selection registers.
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  setDraftName(n)
                                  setNameDropdownOpen(false)
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
                      disabled={!isInitialized || !draftName.trim() || ensPhase !== 'idle'}
                      isLoading={ensPhase !== 'idle'}
                    >
                      {ensPhase === 'checking-owner'
                        ? 'Checking…'
                        : ensPhase === 'creating-session'
                          ? 'Opening…'
                          : 'Confirm'}
                    </Button>
                  </div>
                </form>
              )
            )}

            {ensError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{ensError}</span>
              </div>
            )}
          </div>
        </GuidedSection>

        {allRequestedAttrs.length > 0 && (
          <GuidedSection
            number="02"
            title={
              classValue === 'Person'
                ? 'Your personal profile'
                : classValue === 'Organization'
                  ? "Your organization's profile"
                  : 'Your profile'
            }
            active={confirmed}
            inactiveHint="Confirm your ENS name above to continue."
            accent="green"
          >
            <div className="space-y-4">
              {loadError && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Couldn't load existing records (
                  <span className="font-mono">{loadError}</span>). Submitting new values may
                  overwrite existing data.
                </div>
              )}
              {allRequestedAttrs.map((key) => {
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
            number={allRequestedAttrs.length > 0 ? '03' : '02'}
            title="Social accounts"
            description="Link the accounts you want to attest. Required accounts must be linked before you can continue."
            active={confirmed}
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
                    twitter={twitter}
                    telegram={telegram}
                    onLink={() => handleLink(p)}
                    onUnlink={() => handleUnlink(p)}
                    disconnecting={disconnectingPlatform === p}
                    disabled={isSigning}
                  />
                ))}
              </div>
              {linkError && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{linkError}</span>
                </div>
              )}
            </div>
          </GuidedSection>
        )}
      </GuidedCard>

      <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
        <Button full onClick={handleCreateAttestation} disabled={!canCreate} isLoading={isSigning}>
          {signPhase === 'awaiting-siwe' ? (
            <>
              <FileSignature className="mr-2 h-4 w-4" />
              {previewLabel}
            </>
          ) : (
            previewLabel
          )}
        </Button>
        {signError && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{signError}</span>
          </div>
        )}
        {!canCreate && confirmed && (
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
  const handle =
    platform === 'com.x'
      ? twitter?.username ?? null
      : telegram?.username ?? null
  const avatarUrl =
    platform === 'com.x'
      ? twitter?.profilePictureUrl ?? null
      : telegram?.photoUrl ?? null
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
      {/* Left column: platform name + Required tag (reserved height). */}
      <div className="sm:w-28 sm:shrink-0">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {label}
        </div>
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

      {/* Center column: helper text OR linked identity. */}
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

      {/* Right column: Link / Unlink button. */}
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
// We use rows={1} as the baseline and resize on every value change.
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
