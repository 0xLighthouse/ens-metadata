import { cn } from '@/lib/utils'
import { Check, Minus, ShieldCheck } from 'lucide-react'

export type RecordState = 'empty' | 'populated' | 'attested'

/**
 * One tracked record's state as a chip. Each state pairs its color with a distinct icon and
 * label text, so the three read apart in greyscale. With `href`, the chip links out.
 */
const STYLES: Record<RecordState, { icon: typeof Check; className: string; suffix: string }> = {
  empty: {
    icon: Minus,
    className:
      'border-dashed border-neutral-300 text-neutral-400 dark:border-neutral-700 dark:text-neutral-500',
    suffix: '',
  },
  populated: {
    icon: Check,
    className:
      'border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    suffix: '',
  },
  attested: {
    icon: ShieldCheck,
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
    suffix: ' · verified',
  },
}

const TITLES: Record<RecordState, string> = {
  empty: 'not set',
  populated: 'set, not attested',
  attested: 'set and attested',
}

export function RecordStatus({
  label,
  state,
  href,
}: {
  label: string
  state: RecordState
  href?: string
}) {
  const { icon: Icon, className, suffix } = STYLES[state]
  const classes = cn(
    'inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs font-medium',
    href && 'hover:underline',
    className,
  )
  const title = `${label}: ${TITLES[state]}`
  const content = (
    <>
      <Icon className="size-3" aria-hidden="true" />
      {label}
      {suffix}
    </>
  )

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title={title} className={classes}>
        {content}
      </a>
    )
  }
  return (
    <span title={title} className={classes}>
      {content}
    </span>
  )
}
