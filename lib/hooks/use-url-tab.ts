'use client'

import { useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Tab state synced to a URL search param, so tabs survive refresh and are
 * deep-linkable. Writes use history.replaceState (integrated with the Next.js
 * router) so switching tabs never triggers a server round trip.
 *
 * Callers using this hook must be rendered inside a <Suspense> boundary
 * (useSearchParams requirement).
 */
export function useUrlTab<T extends string>(
  param: string,
  values: readonly T[],
  defaultValue: T
): [T, (value: T) => void] {
  const searchParams = useSearchParams()

  const raw = searchParams.get(param)
  const value = values.includes(raw as T) ? (raw as T) : defaultValue

  const setValue = useCallback(
    (next: T) => {
      const url = new URL(window.location.href)
      if (next === defaultValue) {
        url.searchParams.delete(param)
      } else {
        url.searchParams.set(param, next)
      }
      window.history.replaceState(null, '', url)
    },
    [param, defaultValue]
  )

  return [value, setValue]
}
