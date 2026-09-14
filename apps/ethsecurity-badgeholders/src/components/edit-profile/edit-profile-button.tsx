'use client'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type EditDraft, loadEditDraft } from '@/lib/edit-draft'
import type { BadgeholderRow } from '@/lib/types'
import { Pencil } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

// The drawer drags the SDK, ensjs and the attester client into the bundle; every visitor
// renders this page, so only the badgeholder who clicks Edit should pay for that.
const EditProfileDrawer = dynamic(
  () => import('@/components/edit-profile/edit-profile-drawer').then((m) => m.EditProfileDrawer),
  { ssr: false },
)

/**
 * Opens the profile editor. Disabled, with a reason, for an address that has no primary ENS
 * name, since there is nothing to write records to. Reopens itself when a draft was parked
 * across a social OAuth redirect.
 */
export function EditProfileButton({ row }: { row: BadgeholderRow }) {
  const [open, setOpen] = useState(false)
  const [initialDraft, setInitialDraft] = useState<EditDraft | null>(null)

  useEffect(() => {
    if (!row.ensName) return
    const draft = loadEditDraft(row.address)
    if (!draft) return
    setInitialDraft(draft)
    setOpen(true)
  }, [row.address, row.ensName])

  if (!row.ensName) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              variant="outline"
              size="sm"
              disabled
              className="disabled:bg-transparent disabled:opacity-50"
            >
              <Pencil className="mr-2 size-3.5" aria-hidden="true" />
              Edit profile
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Set a primary ENS name for this address first.</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="mr-2 size-3.5" aria-hidden="true" />
        Edit profile
      </Button>
      <EditProfileDrawer
        row={row}
        ensName={row.ensName}
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setInitialDraft(null)
        }}
        initialDraft={initialDraft}
      />
    </>
  )
}
