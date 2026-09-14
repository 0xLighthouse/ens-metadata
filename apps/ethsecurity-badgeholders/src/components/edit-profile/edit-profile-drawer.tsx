'use client'

import { DiscardDialog } from '@/components/edit-profile/discard-dialog'
import { ProfileFields } from '@/components/edit-profile/profile-fields'
import { PublishNotice, type WalletState } from '@/components/edit-profile/publish-notice'
import { SocialRow } from '@/components/edit-profile/social-row'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useWeb3 } from '@/components/web3-provider'
import { useProfileRecords } from '@/hooks/use-profile-records'
import { PHASE_LABELS, usePublishProfile } from '@/hooks/use-publish-profile'
import { useSocialAccounts } from '@/hooks/use-social-accounts'
import { type EditDraft, clearEditDraft, saveEditDraft } from '@/lib/edit-draft'
import {
  KEEP_ALL_SOCIALS,
  type ProfileForm,
  type SocialDrafts,
  formFromRecords,
  hasPendingChanges,
  validateProfileForm,
} from '@/lib/profile-records'
import { SOCIAL_PLATFORMS, type SocialPlatform, linkedAccountFor } from '@/lib/social'
import type { BadgeholderRow } from '@/lib/types'
import { usePrivy } from '@privy-io/react-auth'
import { ExternalLink, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Drawer } from 'vaul'
import type { Address } from 'viem'

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * The right-hand editing drawer, after the interface app's `EditNodeDrawer`. Owns the form
 * and per-platform drafts, seeds them from a live chain read (or a draft parked across a
 * social OAuth redirect), and hands the result to `usePublishProfile` on save.
 *
 * Non-modal on purpose: Privy's own login modal has to stay clickable above it.
 */
export function EditProfileDrawer({
  row,
  ensName,
  open,
  onOpenChange,
  initialDraft,
}: {
  row: BadgeholderRow
  ensName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A draft restored from `sessionStorage`; seeds the form instead of the chain read. */
  initialDraft: EditDraft | null
}) {
  const { ready, authenticated, login } = usePrivy()
  const web3 = useWeb3()
  const records = useProfileRecords({ ensName, owner: row.address as Address, enabled: open })
  const social = useSocialAccounts()
  const publish = usePublishProfile(row)

  const [form, setForm] = useState<ProfileForm | null>(null)
  const [socials, setSocials] = useState<SocialDrafts>(KEEP_ALL_SOCIALS)
  const [pendingLink, setPendingLink] = useState<SocialPlatform | null>(null)
  const [socialError, setSocialError] = useState<string | null>(null)
  const [showDiscard, setShowDiscard] = useState(false)

  const existing = records.status === 'ready' ? records.existing : null

  // Seed the form once the live records arrive. A parked draft wins over the chain values.
  useEffect(() => {
    if (!open || !existing || form !== null) return
    if (initialDraft) {
      setForm(initialDraft.form)
      setSocials(initialDraft.socials)
      setPendingLink(initialDraft.pendingLink)
    } else {
      setForm(formFromRecords(existing))
    }
  }, [open, existing, form, initialDraft])

  // Start from scratch every time the drawer closes.
  useEffect(() => {
    if (open) return
    setForm(null)
    setSocials(KEEP_ALL_SOCIALS)
    setPendingLink(null)
    setSocialError(null)
    setShowDiscard(false)
    publish.reset()
  }, [open])

  // A Connect that left the page resolves once Privy reports the new account.
  useEffect(() => {
    if (!pendingLink) return
    let account: ReturnType<typeof linkedAccountFor>
    try {
      account = linkedAccountFor(pendingLink, social)
    } catch (err) {
      setSocialError(errorMessage(err))
      setPendingLink(null)
      clearEditDraft(row.address)
      return
    }
    if (!account) return
    setSocials((current) => ({ ...current, [pendingLink]: { kind: 'link', ...account } }))
    setPendingLink(null)
    clearEditDraft(row.address)
  }, [pendingLink, social.twitter, social.telegram, row.address])

  // Privy reported a failed link: stop waiting for it.
  useEffect(() => {
    if (!social.linkError || !pendingLink) return
    setPendingLink(null)
    clearEditDraft(row.address)
  }, [social.linkError, pendingLink, row.address])

  const errors = form ? validateProfileForm(form) : {}
  const dirty = form !== null && existing !== null && hasPendingChanges(existing, form, socials)
  const done = publish.phase === 'done'
  const isOwner = web3.address?.toLowerCase() === row.address
  const walletState: WalletState = !ready
    ? 'loading'
    : !authenticated
      ? 'signed-out'
      : !isOwner
        ? 'wrong-wallet'
        : 'ok'
  const canPublish =
    form !== null &&
    existing !== null &&
    dirty &&
    Object.keys(errors).length === 0 &&
    walletState === 'ok' &&
    pendingLink === null &&
    !publish.busy &&
    !done
  const fieldsDisabled = publish.busy || done
  const socialDisabled = fieldsDisabled || walletState !== 'ok'

  const close = () => {
    clearEditDraft(row.address)
    onOpenChange(false)
  }
  const requestClose = () => {
    if (publish.busy) return
    if (dirty && !done) {
      setShowDiscard(true)
      return
    }
    close()
  }

  const connect = (platform: SocialPlatform) => {
    if (!form) return
    setSocialError(null)
    social.clearLinkError()
    let account: ReturnType<typeof linkedAccountFor>
    try {
      account = linkedAccountFor(platform, social)
    } catch (err) {
      setSocialError(errorMessage(err))
      return
    }
    if (account) {
      setSocials((current) => ({ ...current, [platform]: { kind: 'link', ...account } }))
      return
    }
    // Privy is about to navigate away; park everything so the drawer can pick up where it left off.
    saveEditDraft(row.address, { form, socials, pendingLink: platform })
    setPendingLink(platform)
    social.link(platform)
  }
  const cancelPending = () => {
    setPendingLink(null)
    clearEditDraft(row.address)
  }
  const setDraft = (platform: SocialPlatform, draft: SocialDrafts[SocialPlatform]) =>
    setSocials((current) => ({ ...current, [platform]: draft }))

  const save = () => {
    if (!form || !existing || !canPublish) return
    publish.publish({ existing, form, socials })
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (next) return
        if (publish.busy || (dirty && !done)) return
        close()
      }}
      direction="right"
      handleOnly
      modal={false}
    >
      <Drawer.Portal>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismissal only needs click */}
        <div
          className="fixed inset-0 z-[70] bg-black/40"
          onClick={requestClose}
          aria-hidden="true"
        />
        <Drawer.Content
          className="fixed top-20 right-4 bottom-4 z-[80] flex w-[min(500px,calc(100vw-2rem))] outline-none"
          style={{ '--initial-transform': 'calc(100% + 16px)' } as React.CSSProperties}
        >
          <div className="flex h-full w-full grow flex-col rounded-[16px] border-l border-white bg-[rgb(247,247,248)] p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="relative mb-4">
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close"
                className="-top-2 -right-2 absolute cursor-pointer rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <X size={20} />
              </button>
              <Drawer.Title className="font-semibold text-neutral-900 text-xl dark:text-neutral-50">
                Edit profile
              </Drawer.Title>
              <Drawer.Description className="mt-1 truncate text-neutral-500 text-sm dark:text-neutral-400">
                {ensName}
              </Drawer.Description>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {records.status === 'error' ? (
                <div className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                  <p>Could not read the current records: {records.error}</p>
                  <Button size="sm" variant="outline" onClick={records.reload}>
                    Retry
                  </Button>
                </div>
              ) : form === null ? (
                <div className="flex flex-col gap-4" aria-busy="true">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className={i === 1 ? 'h-24 w-full' : 'h-9 w-full'} />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <ProfileFields
                    form={form}
                    errors={errors}
                    disabled={fieldsDisabled}
                    onChange={(key, value) =>
                      setForm((current) => (current ? { ...current, [key]: value } : current))
                    }
                  />

                  <section className="flex flex-col gap-2">
                    <h3 className="font-medium text-neutral-700 text-sm dark:text-neutral-300">
                      Social accounts
                    </h3>
                    <p className="text-neutral-500 text-xs dark:text-neutral-400">
                      Connect an account to publish a handle the attester has verified. Only the
                      handle is made public.
                    </p>
                    <div className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950">
                      {SOCIAL_PLATFORMS.map((platform) => (
                        <SocialRow
                          key={platform}
                          platform={platform}
                          onChain={records.socials?.[platform] ?? null}
                          draft={socials[platform]}
                          pending={pendingLink === platform}
                          disabled={
                            socialDisabled || (pendingLink !== null && pendingLink !== platform)
                          }
                          onConnect={() => connect(platform)}
                          onRemove={() => setDraft(platform, { kind: 'remove' })}
                          onUndo={() => setDraft(platform, { kind: 'keep' })}
                          onCancelPending={cancelPending}
                        />
                      ))}
                    </div>
                    {(socialError ?? social.linkError) && (
                      <p className="text-red-600 text-xs dark:text-red-400">
                        {socialError ?? social.linkError}
                      </p>
                    )}
                  </section>
                </>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 border-neutral-200 border-t pt-4 dark:border-neutral-700">
              {!done && (
                <PublishNotice state={walletState} expected={row.address} onConnect={login} />
              )}
              {publish.error && (
                <p className="text-red-600 text-sm dark:text-red-400">{publish.error}</p>
              )}
              {done ? (
                <>
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-green-800 text-sm dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200">
                    <p className="font-medium">Published.</p>
                    <p className="mt-1 text-xs">
                      The page refreshes from rcrds.xyz, which can take a few minutes to pick up the
                      new records.
                    </p>
                    {publish.txHash && (
                      <a
                        href={`https://etherscan.io/tx/${publish.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 font-mono text-xs underline-offset-2 hover:underline"
                      >
                        View transaction
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                  <Button onClick={close}>Close</Button>
                </>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={requestClose}
                    disabled={publish.busy}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={save}
                    disabled={!canPublish}
                    isLoading={publish.busy}
                  >
                    {PHASE_LABELS[publish.phase]}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Drawer.Content>
        <DiscardDialog
          open={showDiscard}
          onCancel={() => setShowDiscard(false)}
          onConfirm={() => {
            setShowDiscard(false)
            close()
          }}
        />
      </Drawer.Portal>
    </Drawer.Root>
  )
}
