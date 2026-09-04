'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import React, { useCallback, useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

import { IconButton } from './icon-button'

/**
 * ThemeToggle component
 * Toggles between the light and dark themes. Rendering is deferred until the
 * component has mounted, since the resolved theme is only known on the client.
 */
export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = resolvedTheme === 'dark'

  const handleToggle = useCallback(() => {
    setTheme(isDark ? 'light' : 'dark')
  }, [isDark, setTheme])

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <IconButton
        onClick={handleToggle}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {mounted ? isDark ? <Moon /> : <Sun /> : <span className="size-6" />}
      </IconButton>
    </div>
  )
}
