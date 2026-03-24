'use client'

import { useAppStore } from '@/stores/app'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface Props {
  children: React.ReactNode
}

const SELECT_DOMAIN_PATH = '/select-name'

const getDomainFromPath = (pathname: string): string | null => {
  const first = pathname.split('/').filter(Boolean)[0]
  if (!first || first === 'select-name') return null
  return decodeURIComponent(first)
}

export function DomainGate({ children }: Props) {
  const { activeDomain, isInitialized, status, setActiveDomain } = useAppStore()
  const router = useRouter()
  const pathname = usePathname()

  const urlDomain = getDomainFromPath(pathname)

  // Sync activeDomain when URL domain changes
  useEffect(() => {
    if (!isInitialized || status !== 'ready') return
    if (!urlDomain || activeDomain?.name === urlDomain) return

    // biome-ignore lint/suspicious/noExplicitAny: partial domain object for URL-based activation
    setActiveDomain({ name: urlDomain } as any)
  }, [isInitialized, status, urlDomain, activeDomain?.name, setActiveDomain])

  // Redirect to domain selection if no active domain and app is ready
  useEffect(() => {
    if (
      isInitialized &&
      status === 'ready' &&
      !activeDomain &&
      !pathname.includes(SELECT_DOMAIN_PATH)
    ) {
      router.push(SELECT_DOMAIN_PATH)
    }
  }, [isInitialized, status, activeDomain, pathname, router])

  if (pathname.includes(SELECT_DOMAIN_PATH)) {
    return <>{children}</>
  }

  if (!activeDomain) {
    return null
  }

  return <>{children}</>
}
