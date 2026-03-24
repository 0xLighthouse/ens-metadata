'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { PageInset } from './components/containers'

export default function HomePage() {
  const { user } = usePrivy()
  const router = useRouter()

  // Redirect to the select-name page if the user is authenticated
  useEffect(() => {
    if (user) {
      router.replace('/select-name')
    }
  }, [user, router])

  return (
    <PageInset>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">
          {user?.wallet?.address
            ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}`
            : null}
        </p>
      </div>
    </PageInset>
  )
}
