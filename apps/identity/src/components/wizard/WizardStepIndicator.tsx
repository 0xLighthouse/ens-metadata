import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface Props {
  steps: string[]
  current: number
}

export function WizardStepIndicator({ steps, current }: Props) {
  return (
    <ol className="flex items-center justify-between gap-2 mb-8">
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex-1 flex items-center gap-3">
            <div
              className={cn(
                'h-8 w-8 shrink-0 rounded-full border flex items-center justify-center text-sm font-medium',
                done &&
                  'bg-neutral-900 text-neutral-50 border-neutral-900 dark:bg-neutral-50 dark:text-neutral-900 dark:border-neutral-50',
                active &&
                  'border-neutral-900 text-neutral-900 dark:border-neutral-50 dark:text-neutral-50',
                !done &&
                  !active &&
                  'border-neutral-300 text-neutral-400 dark:border-neutral-700 dark:text-neutral-500',
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                'text-sm hidden sm:inline',
                active
                  ? 'text-neutral-900 dark:text-neutral-50 font-medium'
                  : 'text-neutral-500 dark:text-neutral-400',
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800 mx-2" />
            )}
          </li>
        )
      })}
    </ol>
  )
}
