'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { mainnet } from 'viem/chains'

/** Privy wallet auth, mirroring apps/interface. `appId` comes from `ESB_PRIVY_APP_ID` on the server. */
export function Web3Provider({ appId, children }: { appId: string; children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: { theme: 'dark' },
        supportedChains: [mainnet],
        defaultChain: mainnet,
      }}
    >
      {children}
    </PrivyProvider>
  )
}
