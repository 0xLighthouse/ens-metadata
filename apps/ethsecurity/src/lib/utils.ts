import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const resolveAvatar = (address?: string, size?: string | number) => {
  if (!address) return
  return `https://cdn.stamp.fyi/avatar/${address}${size ? `?s=${size}` : ''}`
}

/**
 * Shortens an address for display, e.g. 0x1234…abcd
 */
export const shortenAddress = (address: string, chars = 4) => {
  if (address.length <= chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}
