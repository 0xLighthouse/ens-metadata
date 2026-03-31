import { GraphQLClient } from 'graphql-request'
import { toast } from 'sonner'
import { create } from 'zustand'

import { ErrorCode } from '@/lib/api/utils/ErrorCode'
import { formatApiError } from '@/lib/api/utils/formatApiError'
import { resolveApiError } from '@/lib/api/utils/resolveApiError'

/**
 * Transforms an upstream service error into a user-friendly error.
 * Logs the original error for debugging and returns a sanitized error for the UI.
 */
function handleUpstreamError(
  error: unknown,
  serviceName: string,
  errorCode?: ErrorCode,
): Error {
  // Always log the original error for debugging
  console.error(`[${serviceName}] Upstream service error:`, error)

  // If a specific error code is provided, use the formatted message for it directly
  if (errorCode) {
    const formatted = formatApiError(errorCode)
    const userError = new Error(formatted.message)
    ;(userError as Error & { code?: string }).code = errorCode
    return userError
  }

  const resolved = resolveApiError(error)

  // Create a new error with the user-friendly message
  const userError = new Error(resolved.message)
  // Attach the error code for downstream handling
  ;(userError as Error & { code?: string }).code = resolved.code

  return userError
}

/**
 * Checks if an error is from an upstream service (network failure, 5xx, etc.)
 */
function isUpstreamServiceError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  // Network-level failures
  if (error instanceof TypeError) return true

  // biome-ignore lint/suspicious/noExplicitAny: Error shapes vary by source
  const anyError = error as any

  // Connection errors
  if (anyError.code === 'ECONNREFUSED' || anyError.code === 'ENOTFOUND') {
    return true
  }

  // HTTP 5xx errors
  if (anyError.response?.status >= 500) {
    return true
  }

  // Request failed errors (graphql-request wraps fetch errors)
  if (anyError.message?.toLowerCase().includes('request failed')) {
    return true
  }

  return false
}

interface ApiState {
  client: GraphQLClient
  ensSubgraph: GraphQLClient
  // biome-ignore lint/suspicious/noExplicitAny: GraphQL variables are dynamic
  publicRequest: <T>(query: string, variables?: any) => Promise<T>
  // biome-ignore lint/suspicious/noExplicitAny: GraphQL variables are dynamic
  ensRequest: <T>(query: string, variables?: any) => Promise<T>
  handleServerError: (error: unknown) => void
  handleRequestError: (error: unknown) => void
  isRequestError: (error?: unknown) => boolean
  logout: () => void
}

export const useApiStore = create<ApiState>((set, get) => ({
  client: new GraphQLClient('NOT_IMPLEMENTED/graphql'),

  ensSubgraph: new GraphQLClient('https://api.alpha.ensnode.io/subgraph'),

  ensRequest: async <T>(query: string, variables = {}): Promise<T> => {
    try {
      return await get().ensSubgraph.request<T>(query, variables)
    } catch (error) {
      // All errors from ensRequest are ENSNode errors — use the specific code
      if (isUpstreamServiceError(error)) {
        const userError = handleUpstreamError(error, 'ENSNode', ErrorCode.ENSNODE_UNAVAILABLE)
        get().handleRequestError(userError)
        throw userError
      }

      // For other errors (e.g., GraphQL validation errors), still attribute to ENSNode
      console.error('[ENSNode] Request error:', error)
      get().handleRequestError(error)
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL error shape is dynamic
      throw (error as any)?.response?.errors || error
    }
  },

  publicRequest: async <T>(query: string, variables = {}): Promise<T> => {
    try {
      return await get().client.request<T>(query, variables)
    } catch (error) {
      // Check if this is an upstream service error
      if (isUpstreamServiceError(error)) {
        const userError = handleUpstreamError(error, 'API')
        get().handleRequestError(userError)
        throw userError
      }

      // For other errors, log and rethrow
      console.error('[API] Request error:', error)
      get().handleRequestError(error)
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL error shape is dynamic
      throw (error as any)?.response?.errors || error
    }
  },

  handleServerError: (error: unknown) => {
    if (!get().isRequestError(error)) {
      console.error(error)

      // Note: Sentry is not installed in this project
      // If you want to add Sentry, install @sentry/nextjs and uncomment:
      // Sentry.captureException(error)

      const resolvedError = resolveApiError(error)

      // If it's an upstream error with a known code, use the formatted message
      if (
        resolvedError.code &&
        Object.values(ErrorCode).includes(resolvedError.code as ErrorCode)
      ) {
        const formatted = formatApiError(resolvedError.code as ErrorCode)
        toast.error(formatted.message)
      } else {
        toast.error(resolvedError.message)
      }
    }
  },

  handleRequestError: (error: unknown) => {
    // biome-ignore lint/suspicious/noExplicitAny: error type is unknown
    const anyError = error as any
    const errStr = anyError?.toString().toLowerCase() || ''
    const errMsg = anyError?.message?.toLowerCase() || ''

    // Handle upstream service errors with user-friendly messages
    if (
      anyError.code === ErrorCode.ENSNODE_UNAVAILABLE ||
      anyError.code === ErrorCode.ENSNODE_ERROR ||
      anyError.code === ErrorCode.UPSTREAM_SERVICE_ERROR
    ) {
      const formatted = formatApiError(anyError.code as ErrorCode)
      toast.error(formatted.message)
      return
    }

    // Handle network request failures
    if (errStr.includes('network request failed') || errMsg.includes('network request failed')) {
      toast.error('Unable to contact server')
      get().logout()
      return
    }

    // Handle authentication errors
    if (
      errStr.includes('invalid or expired token') ||
      errMsg.includes('invalid or expired token')
    ) {
      toast.error('Invalid or expired token')
      get().logout()
      return
    }
  },

  isRequestError: (error?: unknown): boolean => {
    // biome-ignore lint/suspicious/noExplicitAny: error type is unknown
    const anyError = error as any
    const errStr = anyError?.toString().toLowerCase() || ''
    const errMsg = anyError?.message?.toLowerCase() || ''

    return (
      errStr.includes('network request failed') ||
      errStr.includes('invalid or expired token') ||
      errMsg.includes('network request failed') ||
      errMsg.includes('invalid or expired token')
    )
  },

  logout: () => {
    // Import useAppStore dynamically to avoid circular dependencies
    import('./app').then(({ useAppStore }) => {
      useAppStore.getState().logout()
    })
  },
}))

// Export a singleton instance for cases where we need the API client directly without Zustand
export const apiStore = useApiStore.getState()
