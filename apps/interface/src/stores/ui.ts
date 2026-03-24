import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { ErrorCode } from '@/lib/api/utils/ErrorCode'
import { formatApiError } from '@/lib/api/utils/formatApiError'
import type { InitializeStoreProps } from '@/lib/contexts/types'

interface AppRouteHistory {
  currentPath?: string
  lastPath?: string
  lastRoute?: string
}

interface GatedError {
  ref?: string
  showModal: boolean
}

interface AppErrorActions {
  primary?: React.ReactNode
  secondary?: React.ReactNode
  forceResponse?: boolean
}

interface AppDialog {
  title?: string | JSX.Element
  description?: string | JSX.Element
  actions?: AppErrorActions
}

interface AppErrorDialog extends AppDialog {
  code: ErrorCode
}

interface UiState {
  // Config
  isMobile: boolean
  lang: string
  lastPath?: string
  showErrorModal: boolean
  showGatedErrorModal: boolean
  gatedError: GatedError

  // Route history
  routeHistory: AppRouteHistory

  // App error dialog
  appError?: AppDialog
  showAppErrorModal: boolean

  // Actions
  hydrate: (data: InitializeStoreProps) => void
  setRouteHistory: (state: AppRouteHistory) => void
  setAppDialog: (dialog: AppDialog) => void
  setAppError: (error: AppErrorDialog) => void
  closeAppErrorModal: () => void
  setGatedErrorModal: (state: boolean, ref?: string) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      // Initial state
      isMobile: false,
      lang: 'en-US',
      lastPath: undefined,
      showErrorModal: false,
      showGatedErrorModal: false,
      gatedError: { showModal: false, ref: undefined },

      routeHistory: {
        currentPath: undefined,
        lastPath: undefined,
        lastRoute: undefined,
      },

      appError: undefined,
      showAppErrorModal: false,

      // Actions
      hydrate: (data: InitializeStoreProps) => {
        set({
          lang: data.ui.lang ?? 'en-US',
          isMobile: data.ui.isMobile ?? false,
        })
      },

      setRouteHistory: (state: AppRouteHistory) => {
        set({ routeHistory: state })
      },

      setAppDialog: (dialog: AppDialog) => {
        set({
          appError: { ...dialog },
          showAppErrorModal: true,
        })
      },

      setAppError: ({ code, title, description, actions }: AppErrorDialog) => {
        const formattedError = formatApiError(code)
        set({
          appError: {
            title: title || formattedError.title,
            description: description || formattedError.message,
            actions,
          },
          showAppErrorModal: true,
        })
      },

      closeAppErrorModal: () => {
        set({
          appError: undefined,
          showAppErrorModal: false,
        })
      },

      setGatedErrorModal: (state: boolean, ref?: string) => {
        set({
          gatedError: {
            showModal: state,
            ref: ref ?? undefined,
          },
        })
      },
    }),
    {
      name: 'ui-store',
      partialize: (state) => ({
        lang: state.lang,
        isMobile: state.isMobile,
        routeHistory: state.routeHistory,
      }),
    },
  ),
)
