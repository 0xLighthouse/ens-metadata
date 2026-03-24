interface ResolvedError {
  message: string
  code?: string
}

export function resolveApiError(error: unknown): ResolvedError {
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
