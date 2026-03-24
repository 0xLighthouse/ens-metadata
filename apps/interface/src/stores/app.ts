import { AUTH_TOKEN_COOKIE } from '@/config/constants'
import { QUERY_DOMAIN_BY_NAME } from '@/graphql/query.domain-by-name'
import { QUERY_DOMAINS_OWNED } from '@/graphql/query.domains-owned'
import { ENSRootDomain } from '@/types'
import { User } from '@privy-io/react-auth'
import Cookies from 'js-cookie'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useApiStore } from './api'

type AppStatus = 'idle' | 'initializing' | 'loading-domains' | 'ready' | 'error'

const normalizeDomainName = (input: string) => input.trim().toLowerCase()

// biome-ignore lint/suspicious/noExplicitAny: subgraph response shape is dynamic
const toENSRootDomain = (item: any, fallbackName?: string): ENSRootDomain => {
  const name = item.name ?? fallbackName ?? item.id
  return {
    id: item.id,
    label: item.labelName ?? name,
    name,
    namehash: item.id,
    createdAt: item.createdAt,
    expiryDate: item.expiryDate,
    isMigrated: item.isMigrated,
  }
}

interface AppState {
  isInitialized: boolean
  user: User | undefined

  // Spaces state
  activeDomain: ENSRootDomain | null
  registeredDomains: ENSRootDomain[]

  // App state
  status: AppStatus
  error: string | null

  initialize: (user: User) => Promise<void>
  setActiveDomain: (domain: ENSRootDomain) => void
  clearActiveDomain: () => void
  fetchDomains: (userAddress: string) => Promise<void>
  loadDomain: (domainName: string) => Promise<ENSRootDomain>
  logout: () => void
  reset: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      isInitialized: false,
      user: undefined,
      activeDomain: null,
      registeredDomains: [],
      status: 'idle',
      error: null,

      initialize: async (user: User) => {
        set({ status: 'initializing', user })

        try {
          set({
            status: 'loading-domains',
          })
          await get().fetchDomains(user.wallet?.address ?? '')
          set({ status: 'ready', isInitialized: true })
        } catch (error) {
          console.error('AppStore initialization error:', error)
          set({
            status: 'error',
            error: error instanceof Error ? error.message : 'Initialization failed',
          })
        }
      },

      setActiveDomain: (domain: ENSRootDomain) => {
        set({ activeDomain: domain })
      },

      clearActiveDomain: () => {
        set({ activeDomain: null })
      },

      fetchDomains: async (userAddress: string) => {
        try {
          const apiStore = useApiStore.getState()
          // biome-ignore lint/suspicious/noExplicitAny: subgraph response shape is dynamic
          const resp = await apiStore.ensRequest<{ domains: any[] }>(QUERY_DOMAINS_OWNED, {
            address: userAddress,
          })

          // Transform shitty subgraph response to our types
          const domains: ENSRootDomain[] = []
          for (const item of resp.domains) {
            domains.push(toENSRootDomain(item))
          }

          set({
            registeredDomains: domains,
            error: null,
          })
        } catch (error) {
          console.error('AppStore.fetchDomains error:', error)
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch domains',
          })
        }
      },

      loadDomain: async (domainName: string) => {
        const name = normalizeDomainName(domainName)
        if (!name) {
          throw new Error('Enter a domain name to load.')
        }

        const apiStore = useApiStore.getState()
        // biome-ignore lint/suspicious/noExplicitAny: subgraph response shape is dynamic
        const resp = await apiStore.ensRequest<{ domains: any[] }>(QUERY_DOMAIN_BY_NAME, { name })
        const domain = resp.domains?.[0]
        if (!domain) {
          throw new Error(`Domain not found: ${name}`)
        }

        return toENSRootDomain(domain, name)
      },

      logout: () => {
        // Clear cookie
        Cookies.remove(AUTH_TOKEN_COOKIE)

        // Reset all state
        set({
          activeDomain: null,
          registeredDomains: [],
          isInitialized: false,
          status: 'idle',
          error: null,
        })

        // Clear persisted data
        localStorage.removeItem('app-store')

        // Optional: redirect to login/home page
        if (typeof window !== 'undefined') {
          window.location.href = '/'
        }
      },

      reset: () => {
        set({
          activeDomain: null,
          registeredDomains: [],
          isInitialized: false,
          status: 'idle',
          error: null,
        })
      },
    }),
    {
      name: 'app-store',
      partialize: (state) => ({
        activeDomain: state.activeDomain,
        // Don't persist registeredDomains - always fetch fresh
      }),
    },
  ),
)

export type { AppState, AppStatus }
