'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

/** Copies `value` to the clipboard. Icon only, so `label` is what names it for assistive tech. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? `${label} copied` : `Copy ${label}`}
      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  )
}
