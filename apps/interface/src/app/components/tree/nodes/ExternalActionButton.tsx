'use client'

import { cn } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'

interface ExternalActionButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onClick'> {
  url: string
  label: string
  icon?: ReactNode
  iconClassName?: string
}

export function ExternalActionButton({
  url,
  label,
  icon,
  iconClassName,
  className,
  onMouseDown,
  ...props
}: ExternalActionButtonProps) {
  const handleMouseDown = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onMouseDown?.(e)
  }

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      type="button"
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      aria-label={label}
      title={label}
      className={cn(
        'nodrag nopan p-0.5 rounded transition-colors flex-shrink-0 cursor-pointer',
        className,
      )}
      {...props}
    >
      {icon ?? <ExternalLink className={cn('size-3', iconClassName)} />}
    </button>
  )
}
