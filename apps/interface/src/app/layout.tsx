import type { Metadata } from 'next'

import './page.css'

import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { Web3Provider } from '@/contexts/Web3Provider'
import { getThemeCookie } from '@/lib/nextjs/getThemeCookie'

import { RouteTracker } from './components/RouteTracker'
import DefaultLayout from './components/layouts/default'

export const metadata: Metadata = {
  title: 'ENS Metadata Manager',
  description: 'Structure your ENS names with rich, standardized metadata',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Set the tailwind theme from stored cookie preference
  const theme = await getThemeCookie()

  return (
    <html lang="en" className={theme}>
      <head>
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="c719e983-26a5-4bf5-b57e-17a9f9ccb6f9"
        />
      </head>
      <body>
        <RouteTracker />
        <ThemeProvider initialTheme={theme}>
          <Web3Provider>
            <DefaultLayout>{children}</DefaultLayout>
            <Toaster />
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  )
}
