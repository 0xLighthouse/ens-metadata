import { ErrorCode } from './ErrorCode'

interface FormattedError {
  title: string
  message: string
}

export function formatApiError(code: ErrorCode): FormattedError {
  switch (code) {
    case ErrorCode.UNAUTHORIZED:
      return {
        title: 'Authentication Required',
        message: 'Please sign in to access this feature.',
      }

    case ErrorCode.INVALID_TOKEN:
    case ErrorCode.TOKEN_EXPIRED:
      return {
        title: 'Session Expired',
        message: 'Your session has expired. Please sign in again.',
      }

    case ErrorCode.VALIDATION_ERROR:
    case ErrorCode.INVALID_INPUT:
      return {
        title: 'Invalid Input',
        message: 'Please check your input and try again.',
      }

    case ErrorCode.MISSING_REQUIRED_FIELD:
      return {
        title: 'Missing Information',
        message: 'Please fill in all required fields.',
      }

    case ErrorCode.NOT_FOUND:
      return {
        title: 'Not Found',
        message: 'The requested resource could not be found.',
      }

    case ErrorCode.ALREADY_EXISTS:
      return {
        title: 'Already Exists',
        message: 'This resource already exists.',
      }

    case ErrorCode.FORBIDDEN:
      return {
        title: 'Access Denied',
        message: 'You do not have permission to perform this action.',
      }

    case ErrorCode.INTERNAL_SERVER_ERROR:
    case ErrorCode.DATABASE_ERROR:
      return {
        title: 'Server Error',
        message: 'An internal server error occurred. Please try again later.',
      }

    case ErrorCode.SERVICE_UNAVAILABLE:
      return {
        title: 'Service Unavailable',
        message: 'The service is temporarily unavailable. Please try again later.',
      }

    case ErrorCode.NETWORK_ERROR:
      return {
        title: 'Network Error',
        message: 'Please check your internet connection and try again.',
      }

    case ErrorCode.TIMEOUT:
      return {
        title: 'Request Timeout',
        message: 'The request took too long to complete. Please try again.',
      }

    case ErrorCode.UPSTREAM_SERVICE_ERROR:
      return {
        title: 'External Service Error',
        message: 'An external service is temporarily unavailable. Please try again later.',
      }

    case ErrorCode.ENSNODE_UNAVAILABLE:
      return {
        title: 'ENS Node Subgraph Unavailable',
        message: 'The ENS node subgraph is currently down. Please try again later.',
      }

    case ErrorCode.ENSNODE_ERROR:
      return {
        title: 'ENS Node Subgraph Error',
        message: 'The ENS node subgraph is currently down. Please try again later.',
      }

    case ErrorCode.INSUFFICIENT_BALANCE:
      return {
        title: 'Insufficient Balance',
        message: 'You do not have enough balance to complete this transaction.',
      }

    case ErrorCode.TRANSACTION_FAILED:
      return {
        title: 'Transaction Failed',
        message: 'The transaction could not be completed. Please try again.',
      }

    case ErrorCode.INVALID_SIGNATURE:
      return {
        title: 'Invalid Signature',
        message: 'The signature verification failed. Please try signing again.',
      }

    default:
      return {
        title: 'Unexpected Error',
        message: 'An unexpected error occurred. Please try again.',
      }
  }
}
