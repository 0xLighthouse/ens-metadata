import { ScrollArea } from '@/components/ui/scroll-area'
import { ReactNode } from 'react'

type ListContainerProps = {
  children: ReactNode
  title?: string | null
  count?: number
  className?: string
}

export const ListContainer = ({ children, title, count, className = '' }: ListContainerProps) => {
  return (
    <div className={className}>
      {title && (
        <h1 className="text-h2 mb-4">
          {title} {count !== undefined && `(${count})`}
        </h1>
      )}
      <ScrollArea className="w-full mb-24">
        <div>{children}</div>
      </ScrollArea>
    </div>
  )
}
