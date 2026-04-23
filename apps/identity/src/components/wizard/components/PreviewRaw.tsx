'use client'

import { useWizardStore } from '@/stores/wizard'
import { useMemo } from 'react'
import { StatusBadge } from './StatusBadge'

interface Props {
  classValue?: string
  schemaUri?: string
}

/** Raw text-record view: every key that will be written on-chain, verbatim,
 *  including structural class/schema and the full envelope hex for each proof. */
export function PreviewRaw({ classValue, schemaUri }: Props) {
  const recordDiff = useWizardStore((s) => s.recordDiff)
  const proofs = useWizardStore((s) => s.proofs)

  const rows = useMemo(() => {
    type RawRow = {
      key: string
      status: 'added' | 'updated' | 'removed'
      newValue?: string
      prevValue?: string
    }
    const out: RawRow[] = []

    if (classValue) out.push({ key: 'class', status: 'added', newValue: classValue })
    if (schemaUri) out.push({ key: 'schema', status: 'added', newValue: schemaUri })

    for (const a of recordDiff.added) {
      if (a.key === 'class' || a.key === 'schema') continue
      out.push({ key: a.key, status: 'added', newValue: a.next })
    }
    for (const u of recordDiff.updated) {
      if (u.key === 'class' || u.key === 'schema') continue
      out.push({ key: u.key, status: 'updated', newValue: u.next, prevValue: u.prev })
    }
    for (const r of recordDiff.removed) {
      out.push({ key: r.key, status: 'removed', prevValue: r.prev })
    }

    for (const { draft, records } of proofs) {
      out.push({ key: draft.claim.p, status: 'added', newValue: draft.claim.h })
      out.push({ key: records.handle.key, status: 'added', newValue: records.handle.hex })
      out.push({ key: records.uid.key, status: 'added', newValue: records.uid.hex })
    }

    return out
  }, [classValue, schemaUri, recordDiff, proofs])

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">Nothing will change.</p>
  }

  return (
    <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50/60 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900/40">
      {rows.map((row) => (
        <div key={row.key} className="flex gap-3 px-4 py-3">
          <div className="shrink-0 pt-0.5">
            <StatusBadge status={row.status} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="break-all font-mono text-xs text-neutral-500 dark:text-neutral-400">
              {row.key}
            </div>
            {row.prevValue !== undefined && (
              <div className="break-all font-mono text-xs text-neutral-400 line-through dark:text-neutral-500">
                {row.prevValue}
              </div>
            )}
            {row.newValue !== undefined && (
              <div className="break-all font-mono text-xs text-neutral-900 dark:text-neutral-100">
                {row.newValue}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
