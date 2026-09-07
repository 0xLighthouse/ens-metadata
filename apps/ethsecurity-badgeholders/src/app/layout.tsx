import type { Metadata } from 'next'

import './globals.css'

import { ThemeProvider } from '@/components/theme-provider'
import { Web3Provider } from '@/components/web3-provider'
import { fetchBadgeholders } from '@/lib/dune'

import DefaultLayout from './components/layouts/default'

export const metadata: Metadata = {
  title: 'ETHSecurity Badgeholders',
  description: 'ETHSecurity badgeholders and their ENS metadata',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Without a Privy app id the site still renders, just without the wallet button.
  const privyAppId = process.env.ESB_PRIVY_APP_ID
  const badgeholderCount = (await fetchBadgeholders()).length

  const layout = (
    <DefaultLayout walletEnabled={Boolean(privyAppId)} badgeholderCount={badgeholderCount}>
      {children}
    </DefaultLayout>
  )

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {privyAppId ? <Web3Provider appId={privyAppId}>{layout}</Web3Provider> : layout}
        </ThemeProvider>
      </body>
    </html>
  )
}
