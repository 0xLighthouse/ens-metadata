import type { Metadata } from 'next'

import './globals.css'

import { ThemeProvider } from '@/components/theme-provider'

import DefaultLayout from './components/layouts/default'

export const metadata: Metadata = {
  title: 'ETHSecurity Badgeholders',
  description: 'ETHSecurity badgeholders and their ENS metadata',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <DefaultLayout>{children}</DefaultLayout>
        </ThemeProvider>
      </body>
    </html>
  )
}
