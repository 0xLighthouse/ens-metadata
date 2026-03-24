import { Card } from '@/components/ui/card'
import { Typography } from '@/components/ui/typography'
import { ReactNode } from 'react'

type PageSectionProps = {
  children: ReactNode
  title?: string
  className?: string
  action?: ReactNode
}

export const PageSection = ({ children, title, className = '', action }: PageSectionProps) => {
  return (
    <Card className={`p-6 mb-6 ${className} shadow-none`}>
      {(title || action) && (
        <div className="flex justify-between items-center mb-4">
          {title && <Typography variant="h4">{title}</Typography>}
          {action}
        </div>
      )}
      <div className="w-full">{children}</div>
    </Card>
  )
}
