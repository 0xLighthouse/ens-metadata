'use client'

import { cloneElement, useId, useState } from 'react'

/**
 * A labelled control. The single child is cloned with a generated id so the
 * label is genuinely associated with it rather than relying on nesting.
 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactElement
}) {
  const id = useId()
  return (
    <div className="block">
      <label htmlFor={id} className="block text-[11px] uppercase tracking-wider text-muted">
        {label}
      </label>
      {cloneElement(children, { id } as Partial<unknown>)}
      {hint ? <span className="mt-1 block text-[11px] text-muted">{hint}</span> : null}
    </div>
  )
}

export function Button({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="border border-ink bg-ink px-3 py-1.5 text-panel hover:opacity-85"
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} className="border border-rule px-3 py-1.5 hover:border-ink">
      {children}
    </button>
  )
}

/** A read-only value in an input box, with a button that copies it to the clipboard. */
export function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard access can be refused; the value stays selectable either way.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} className="min-w-0 flex-1" />
      <GhostButton onClick={copy}>{copied ? 'Copied' : 'Copy'}</GhostButton>
    </div>
  )
}

/**
 * Label/value rows. Values wrap rather than truncate — a half-shown digest is
 * useless. `copyable` marks which labels render as a copyable input box.
 */
export function Rows({
  rows,
  copyable,
}: {
  rows: Array<[string, string]>
  copyable?: (label: string) => boolean
}) {
  if (rows.length === 0) return null
  return (
    <dl className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] items-center gap-x-4 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-all">{copyable?.(k) ? <CopyValue value={v} /> : v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="border border-rule bg-panel p-4">
      {title ? (
        <h2 className="mb-3 text-[11px] uppercase tracking-wider text-muted">{title}</h2>
      ) : null}
      {children}
    </section>
  )
}

export function Verdict({ valid, reason }: { valid: boolean; reason?: string }) {
  return (
    <p
      className="border p-3"
      style={{
        borderColor: valid ? 'var(--ok)' : 'var(--fail)',
        color: valid ? 'var(--ok)' : 'var(--fail)',
      }}
    >
      {valid ? 'VALID' : `INVALID — ${reason ?? 'bad-signature'}`}
    </p>
  )
}
