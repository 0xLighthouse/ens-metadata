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
import {
  BADGEHOLDERS_CACHE_TTL_SECONDS,
  BADGEHOLDERS_DUNE_QUERY_ID,
  BADGE_CONTRACT_ADDRESS,
} from '@/lib/constants'
import { Check, Copy, ExternalLink, FileText, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'

const SectionTitle = ({ icon: Icon, children }: { icon: typeof FileText; children: string }) => (
  <div className="flex items-center gap-2">
    <Icon className="size-4 text-neutral-500" />
    <span className="font-semibold text-neutral-700 text-sm dark:text-neutral-300">{children}</span>
  </div>
)

const ParameterRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 px-4 py-3">
    <span className="text-neutral-600 text-sm dark:text-neutral-400">{label}</span>
    <span className="text-right font-medium text-neutral-900 text-sm dark:text-neutral-50">
      {children}
    </span>
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

/** Header icon button opening the badge contract and parameters dialog. */
export function ContractsDialog({ badgeholderCount }: { badgeholderCount: number }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <IconButton aria-label="Badge contract and parameters">
          <FileText className="size-6" />
        </IconButton>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Badge contract and parameters</DialogTitle>
          <DialogDescription>
            Where the badgeholder list and its ENS data come from.
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-3">
          <SectionTitle icon={SlidersHorizontal}>Parameters</SectionTitle>
          <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-100 dark:divide-neutral-800 dark:border-neutral-800">
            <ParameterRow label="Token">ETHSecurity Badge (BADGE)</ParameterRow>
            <ParameterRow label="Standard">ERC-721 behind an EIP-1967 proxy</ParameterRow>
            <ParameterRow label="Badgeholders">{badgeholderCount}</ParameterRow>
            <ParameterRow label="Badgeholder list">
              <a
                href={`https://dune.com/queries/${BADGEHOLDERS_DUNE_QUERY_ID}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:underline"
              >
                Dune query {BADGEHOLDERS_DUNE_QUERY_ID}
                <ExternalLink className="size-3 opacity-50" />
              </a>
            </ParameterRow>
            <ParameterRow label="Refresh">
              Every {BADGEHOLDERS_CACHE_TTL_SECONDS / 3600} hour
            </ParameterRow>
          </div>
          <p className="text-center text-neutral-400 text-xs dark:text-neutral-500">
            Badge data comes from Dune; ENS records and attestations from rcrds.xyz.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionTitle icon={FileText}>Contracts</SectionTitle>
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
