'use client'

import { useWizardStore } from '@/stores/wizard'
import { useMemo } from 'react'

interface Props {
  keyLabels: Record<string, string>
}

const PLATFORM_LABELS: Record<string, string> = { 'com.x': 'X.com', 'org.telegram': 'Telegram' }

/** Human-readable "what your profile will look like" view. Flattens adds +
 *  updates + unchanged + proofs into a single labelled list. class/schema
 *  are hidden — they're structural, not user-facing profile fields. */
export function PreviewPretty({ keyLabels }: Props) {
  const recordDiff = useWizardStore((s) => s.recordDiff)
  const proofs = useWizardStore((s) => s.proofs)
  const unchangedRecords = useWizardStore((s) => s.unchangedRecords)

  const entries = useMemo(() => {
    const rows: Array<{
      key: string
      label?: string
      value: string
      tone: 'added' | 'updated' | 'unchanged'
      isProof?: boolean
      handle?: string
    }> = []
    const seen = new Set<string>()

    for (const a of recordDiff.added) {
      if (seen.has(a.key) || a.key === 'class' || a.key === 'schema') continue
      rows.push({ key: a.key, value: a.next, tone: 'added' })
      seen.add(a.key)
    }
    for (const u of recordDiff.updated) {
      if (seen.has(u.key) || u.key === 'class' || u.key === 'schema') continue
      rows.push({ key: u.key, value: u.next, tone: 'updated' })
      seen.add(u.key)
    }
    for (const r of unchangedRecords) {
      if (seen.has(r.key) || r.key === 'class' || r.key === 'schema') continue
      rows.push({ key: r.key, value: r.value, tone: 'unchanged' })
      seen.add(r.key)
    }

    for (const { draft, records } of proofs) {
      const platform = draft.claim.p
      const handle = draft.claim.h
      rows.push({
        key: records.handle.key,
        label: PLATFORM_LABELS[platform] ?? platform,
        value: `@${handle}`,
        tone: 'added',
        isProof: true,
        handle,
      })
    }

    return rows
  }, [recordDiff, proofs, unchangedRecords])

  const removedEntries = recordDiff.removed

  if (entries.length === 0 && removedEntries.length === 0) {
    return <p className="text-sm text-neutral-500">Nothing will change.</p>
  }

  return (
    <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
      {entries.map((row) => (
        <div
          key={row.key}
          className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
        >
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 sm:w-40 sm:shrink-0">
            <span>{row.label ?? keyLabels[row.key] ?? row.key}</span>
            {row.tone === 'updated' && (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                updated
              </span>
            )}
          </div>
          <div className="min-w-0 text-sm text-neutral-900 dark:text-neutral-100">
            {row.isProof ? (
              <span className="inline-flex items-center rounded-full border border-green-300 bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:border-green-700 dark:bg-green-900/40 dark:text-green-300">
                Attestation (@{row.handle})
              </span>
            ) : (
              <span className="break-words">{row.value}</span>
            )}
          </div>
        </div>
      ))}
      {removedEntries.map((row) => (
        <div
          key={row.key}
          className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
        >
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 sm:w-40 sm:shrink-0">
            <span>{keyLabels[row.key] ?? row.key}</span>
            <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-red-700 dark:bg-red-950/40 dark:text-red-300">
              cleared
            </span>
          </div>
          <div className="min-w-0 break-words text-sm text-neutral-500 line-through dark:text-neutral-500">
            {row.prev}
          </div>
        </div>
      ))}
    </div>
  )
}
