import type { Metadata } from 'next'

import './globals.css'

import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Web3Provider } from '@/components/web3-provider'
import { isWalletEnabled } from '@/lib/env'

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
  // Without a Privy app id the site still renders, just without the wallet button or editing.
  const privyAppId = isWalletEnabled() ? process.env.ESB_PRIVY_APP_ID : undefined
  const layout = <DefaultLayout walletEnabled={Boolean(privyAppId)}>{children}</DefaultLayout>

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider delayDuration={200}>
            {privyAppId ? <Web3Provider appId={privyAppId}>{layout}</Web3Provider> : layout}
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
