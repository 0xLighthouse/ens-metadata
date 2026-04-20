import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function shortAddress(address?: string, chars = 4) {
  if (!address) return ''
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

export function formatKeyName(key: string): string {
  if (key.includes('.')) return key
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' ')
}
