import { cn } from '@/lib/utils'
import * as React from 'react'

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: callers pass htmlFor
    <label
      className={cn(
        'font-medium text-neutral-700 text-sm leading-none dark:text-neutral-300',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
