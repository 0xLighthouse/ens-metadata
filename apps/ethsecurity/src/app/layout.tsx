import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import './globals.css'

import { SiteHeader } from '@/components/site-header'
import { ThemeProvider } from '@/components/theme-provider'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

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
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex flex-1 flex-col gap-4 py-4">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
