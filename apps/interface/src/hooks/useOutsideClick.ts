import { type RefObject, useEffect } from 'react'

export function useOutsideClick(
  ref: RefObject<HTMLElement | null>,
  callback: () => void,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) callback()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [ref, callback, active])
}
