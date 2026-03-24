'use client'

import { MetricsStats } from '@/components/metrics-stats'
import { APP_NAME } from '@/config/constants'

export function Unauthenticated() {
  return (
    <div className="flex flex-col items-center justify-center space-y-8 p-4 py-16">
      <div className="text-center space-y-6 max-w-lg">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">{APP_NAME}</h1>
          <p className="text-muted-foreground text-lg">
            View, edit, and publish metadata attached to ENS names.
            <br />
            Connect your wallet to get started.
          </p>
        </div>
      </div>

      <MetricsStats />
    </div>
  )
}
