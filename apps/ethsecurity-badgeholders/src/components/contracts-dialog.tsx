'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { IconButton } from '@/components/ui/icon-button'
import { BADGE_CONTRACT_ADDRESS } from '@/lib/constants'
import { Check, Copy, ExternalLink, FileText } from 'lucide-react'
import { useState } from 'react'

const SectionTitle = ({ icon: Icon, children }: { icon: typeof FileText; children: string }) => (
  <div className="flex items-center gap-2">
    <Icon className="size-4 text-neutral-500" />
    <span className="font-semibold text-neutral-700 text-sm dark:text-neutral-300">{children}</span>
  </div>
)

/** A contract address with a tag, copy button, and Etherscan link, after the platform dialog. */
const AddressRow = ({ label, address }: { label: string; address: string }) => {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const short = `${address.slice(0, 18)}…${address.slice(-12)}`

  return (
    <div className="flex items-center gap-3 border-neutral-100 border-b py-3 last:border-0 dark:border-neutral-800">
      <span className="shrink-0 rounded border border-neutral-300 px-2 py-0.5 font-mono font-semibold text-neutral-700 text-xs tracking-wide dark:border-neutral-600 dark:text-neutral-300">
        {label}
      </span>
      <span className="flex-1 truncate font-mono text-neutral-600 text-sm dark:text-neutral-400">
        {short}
      </span>
      <button
        type="button"
        onClick={copy}
        title={copied ? 'Copied' : 'Copy address'}
        className="shrink-0 p-1 text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <a
        href={`https://etherscan.io/address/${address}`}
        target="_blank"
        rel="noreferrer"
        title="View on Etherscan"
        className="shrink-0 p-1 text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
      >
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  )
}

/**
 * Header icon button opening the badge contract dialog. It names only the on-chain contract,
 * with an Etherscan link; it deliberately says nothing about how the badgeholder list is fetched.
 */
export function ContractsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <IconButton aria-label="Badge contract">
          <FileText className="size-6" />
        </IconButton>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Badge contract</DialogTitle>
          <DialogDescription>
            The ETHSecurity Badge (BADGE) ERC-721 contract on Ethereum mainnet.
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionTitle icon={FileText}>Contract</SectionTitle>
            <span className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 font-medium text-neutral-600 text-xs dark:border-neutral-700 dark:text-neutral-400">
              <span className="text-base leading-none">⟠</span>
              Ethereum
            </span>
          </div>
          <div className="rounded-lg border border-neutral-100 px-4 dark:border-neutral-800">
            <AddressRow label="BADGE" address={BADGE_CONTRACT_ADDRESS} />
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}
