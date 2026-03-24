'use client'

import React from 'react'

import { colorSystem, typography } from '@/config/theme'
import { shortAddress } from '@/lib/shortAddress'
import { cn } from '@/lib/utils'
import { resolveAvatar } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { Button } from './ui/button'

interface Props {
  className?: string
  showUserInfo?: boolean
  variant?: 'default' | 'minimal'
}

const EXPECTED_CHAIN_ID = 'eip155:1' // Ethereum Mainnet

const networkNames: Record<string, string> = {
  'eip155:1': 'Ethereum',
  'eip155:84532': 'Base Sepolia',
  'eip155:8453': 'Base',
  'eip155:42161': 'Arbitrum',
  'eip155:421614': 'Arbitrum Sepolia',
  'eip155:137': 'Polygon',
  'eip155:31337': 'Hardhat',
}

export const ConnectButton: React.FC<Props> = ({
  className,
  showUserInfo = true,
  variant = 'default',
}) => {
  const { login, logout: privyLogout, authenticated, ready, user } = usePrivy()
  const { wallets } = useWallets()
  const { logout } = useAppStore()
  const wallet = wallets[0]
  const chainId = wallet?.chainId
  const isWrongNetwork = chainId ? chainId !== EXPECTED_CHAIN_ID : false
  const networkName = chainId ? networkNames[chainId] || 'Unknown Network' : undefined

  const handleLogout = async () => {
    try {
      // Logout from app store (handles state, cookies, redirect)
      logout()
      // Then logout from Privy
      await privyLogout()
    } catch (error) {
      console.error('Error during logout:', error)
      // App store logout already completed, so state is clean
    }
  }

  const handleNetworkClick = async () => {
    if (isWrongNetwork && wallets.length > 0) {
      try {
        // Use Privy's switchChain method
        await wallets[0].switchChain(1) // Ethereum Mainnet chain ID
      } catch (error) {
        console.error('Failed to switch network:', error)
        alert('Please switch to Ethereum Mainnet in your wallet')
      }
    }
  }

  if (!ready) {
    return (
      <div className={cn('animate-pulse', className)}>
        <div className="h-10 bg-neutral-200 dark:bg-neutral-700 rounded-md w-24" />
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Button onClick={login} variant="default" size="default">
          Connect Wallet
        </Button>
      </div>
    )
  }

  if (variant === 'minimal') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Button onClick={handleLogout} variant="ghost" size="sm">
          Disconnect
        </Button>
      </div>
    )
  }

  const walletAddress = user?.wallet?.address
  const avatarUrl = walletAddress ? resolveAvatar(walletAddress, 32) : undefined

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50',
        className,
      )}
    >
      {showUserInfo && (
        <div className="flex items-center gap-2">
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt="User avatar"
              className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
          <div className="flex flex-col">
            <span className={cn(typography('body-sm', 'medium'), colorSystem.text.primary)}>
              {shortAddress(walletAddress ?? '')}
            </span>
            <span
              className={cn(
                typography('caption'),
                isWrongNetwork
                  ? 'text-amber-600 dark:text-amber-400 cursor-pointer hover:underline'
                  : colorSystem.text.secondary,
              )}
              onClick={isWrongNetwork ? handleNetworkClick : undefined}
              onKeyDown={
                isWrongNetwork
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleNetworkClick()
                      }
                    }
                  : undefined
              }
              role={isWrongNetwork ? 'button' : undefined}
              tabIndex={isWrongNetwork ? 0 : undefined}
              title={isWrongNetwork ? 'Click to switch to Ethereum' : undefined}
            >
              {isWrongNetwork ? 'Switch to Ethereum' : networkName || 'Connected'}
            </span>
          </div>
        </div>
      )}
      <Button onClick={handleLogout} variant="outline" size="sm">
        Disconnect
      </Button>
    </div>
  )
}
