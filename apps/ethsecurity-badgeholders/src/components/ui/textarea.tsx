import { inputClassName } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import * as React from 'react'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(inputClassName, 'min-h-24 resize-y', className)} {...props} />
}

export { Textarea }
