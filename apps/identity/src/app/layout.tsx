import type { Metadata } from 'next'

import './globals.css'

import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { Web3Provider } from '@/contexts/Web3Provider'

export const metadata: Metadata = {
  title: 'ENS Profile Metadata',
  description: 'Attach metadata and social media accounts to your ENS profile',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <Web3Provider>
            {children}
            <Toaster />
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  )
}
