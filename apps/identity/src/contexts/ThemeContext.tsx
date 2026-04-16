'use client'

import { UITheme } from '@/config/theme'
import { type FC, type ReactNode, createContext, useCallback, useContext, useState } from 'react'

interface ThemeContextType {
  theme: UITheme
  setTheme: (theme: UITheme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: FC<{ children: ReactNode; initialTheme?: UITheme }> = ({
  children,
  initialTheme = UITheme.LIGHT,
}) => {
  const [theme, setTheme] = useState(initialTheme)

  const updateTheme = useCallback((next: UITheme) => {
    setTheme(next)
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', next === UITheme.DARK)
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme: updateTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
