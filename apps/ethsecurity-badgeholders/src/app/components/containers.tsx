import { cn } from '@/lib/utils'

/**
 * PageInset is a container that wraps the page content.
 * It is used to create a consistent layout for the page.
 *
 * `className` is merged last, so a page can narrow the default measure.
 */
export function PageInset({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto flex w-full max-w-5xl flex-col gap-3 p-6', className)}>
      {children}
    </div>
  )
}
