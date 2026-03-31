import { ErrorCode } from './ErrorCode'

interface ResolvedError {
  message: string
  code?: string
}

/**
 * Determines if an error originated from an upstream/external service.
 * Used to differentiate between our app errors and external service failures.
 */
function isUpstreamError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  // Check for network-level failures (connection refused, timeout, etc.)
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return true
  }

  // Check for GraphQL client errors that indicate upstream issues
  // biome-ignore lint/suspicious/noExplicitAny: Error shapes vary by source
  const anyError = error as any

  // Network failures during GraphQL request
  if (anyError.code === 'ECONNREFUSED' || anyError.code === 'ENOTFOUND') {
    return true
  }

  // HTTP errors from upstream (5xx responses)
  if (anyError.response?.status >= 500) {
    return true
  }

  // GraphQL errors that indicate upstream service issues
  const gqlErrors = anyError.response?.errors
  if (Array.isArray(gqlErrors)) {
    return gqlErrors.some(
      (err: { message?: string; extensions?: { code?: string } }) =>
        err.extensions?.code === 'INTERNAL_SERVER_ERROR' ||
        err.message?.toLowerCase().includes('service') ||
        err.message?.toLowerCase().includes('upstream') ||
        err.message?.toLowerCase().includes('unavailable'),
    )
  }

  return false
}

/**
 * Determines if an error is specifically from ENSNode service.
 */
function isEnsNodeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  // biome-ignore lint/suspicious/noExplicitAny: Error shapes vary by source
  const anyError = error as any

  // Check if the error URL contains ensnode
  const errorUrl = anyError.response?.url || anyError.url || ''
  if (errorUrl.toLowerCase().includes('ensnode')) {
    return true
  }

  // Check if error message references ENSNode
  const message = anyError.message || ''
  if (message.toLowerCase().includes('ensnode')) {
    return true
  }

  return false
}

export function resolveApiError(error: unknown): ResolvedError {
  // Handle upstream/external service errors first
  if (isUpstreamError(error)) {
    if (isEnsNodeError(error)) {
      // Determine if it's a connection issue or a service error
      if (
        error instanceof TypeError ||
        // biome-ignore lint/suspicious/noExplicitAny: Error shapes vary
        (error as any).code === 'ECONNREFUSED' ||
        // biome-ignore lint/suspicious/noExplicitAny: Error shapes vary
        (error as any).code === 'ENOTFOUND'
      ) {
        return {
          message: 'Unable to connect to the ENSNode service. Please try again later.',
          code: ErrorCode.ENSNODE_UNAVAILABLE,
        }
      }
      return {
        message: 'The ENSNode service returned an error. Please try again later.',
        code: ErrorCode.ENSNODE_ERROR,
      }
    }

    return {
      message: 'An external service is temporarily unavailable. Please try again later.',
      code: ErrorCode.UPSTREAM_SERVICE_ERROR,
    }
  }

  // Handle GraphQL errors
  if (error && typeof error === 'object' && 'response' in error) {
    // biome-ignore lint/suspicious/noExplicitAny: GraphQL error shape is dynamic
    const gqlError = error as any
    if (gqlError.response?.errors?.[0]?.message) {
      return {
        message: gqlError.response.errors[0].message,
        code: gqlError.response.errors[0].extensions?.code,
      }
    }
  }

  // Handle network errors
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes('network')) {
      return { message: 'Network error occurred. Please check your connection.' }
    }
    if (error.message.toLowerCase().includes('fetch')) {
      return { message: 'Failed to connect to server. Please try again.' }
    }
    return { message: error.message }
  }

  // Handle string errors
  if (typeof error === 'string') {
    return { message: error }
  }

  return { message: 'An unexpected error occurred' }
}
