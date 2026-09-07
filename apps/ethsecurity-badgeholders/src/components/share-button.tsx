'use client'

import { Check, Share2 } from 'lucide-react'
import { useState } from 'react'

/** Copies the current page URL to the clipboard, after the platform profile's share button. */
export function ShareButton() {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy link"
      title={copied ? 'Link copied' : 'Copy link'}
      className="flex size-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
    >
      {copied ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
    </button>
  )
}
