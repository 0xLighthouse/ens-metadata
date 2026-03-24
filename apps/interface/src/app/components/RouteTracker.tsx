'use client'

import { useUiStore } from '@/stores/ui'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Tracks route changes and stores them in the UI store.
 * Should be mounted at the highest level (layout) to capture all route changes.
 */
export function RouteTracker() {
  const pathname = usePathname()
  const { routeHistory, setRouteHistory } = useUiStore()

  useEffect(() => {
    // Only update if the path has actually changed
    if (pathname !== routeHistory.currentPath) {
      setRouteHistory({
        currentPath: pathname,
        lastPath: routeHistory.currentPath,
        lastRoute: routeHistory.lastRoute,
      })
    }
  }, [pathname, routeHistory, setRouteHistory])

  // This component doesn't render anything
  return null
}
