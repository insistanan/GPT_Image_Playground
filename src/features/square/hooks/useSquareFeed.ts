import { useCallback, useEffect, useRef, useState } from 'react'
import type { SquareShareKind, SquareShareSummary } from '@/types'
import { isSquareApiConfigured, squareApiClient } from '@/features/square/lib/squareApiClient'

export type SquareFeedKind = SquareShareKind | 'mine'

interface UseSquareFeedOptions {
  kind: SquareFeedKind
  query: string
}

export function useSquareFeed({ kind, query }: UseSquareFeedOptions) {
  const [items, setItems] = useState<SquareShareSummary[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configured = isSquareApiConfigured()
  const normalizedQuery = query.trim()

  const requestVersion = useRef(0)
  const pageAbort = useRef<AbortController | null>(null)
  const moreAbort = useRef<AbortController | null>(null)
  const loadingMoreVersion = useRef<number | null>(null)

  const loadFirstPage = useCallback(async () => {
    const version = ++requestVersion.current
    pageAbort.current?.abort()
    moreAbort.current?.abort()
    const controller = new AbortController()
    pageAbort.current = controller
    loadingMoreVersion.current = null
    setIsLoadingMore(false)
    setNextCursor(null)
    if (!configured) {
      setIsLoading(false)
      setItems([])
      setNextCursor(null)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const result = kind === 'mine'
        ? await squareApiClient.listMyShares({
            q: normalizedQuery,
            limit: 30,
          }, controller.signal)
        : await squareApiClient.listSquare({
            kind,
            q: normalizedQuery,
            limit: 30,
          }, controller.signal)
      if (version !== requestVersion.current || controller.signal.aborted) return
      setItems(result.items)
      setNextCursor(result.nextCursor)
    } catch (loadError) {
      if (version !== requestVersion.current || controller.signal.aborted) return
      setItems([])
      setNextCursor(null)
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      if (version === requestVersion.current) setIsLoading(false)
    }
  }, [configured, kind, normalizedQuery])

  const loadMore = useCallback(async () => {
    const version = requestVersion.current
    if (!configured || !nextCursor || isLoading || loadingMoreVersion.current === version) return
    loadingMoreVersion.current = version
    const controller = new AbortController()
    moreAbort.current = controller

    setIsLoadingMore(true)
    setError(null)
    try {
      const result = kind === 'mine'
        ? await squareApiClient.listMyShares({
            q: normalizedQuery,
            cursor: nextCursor,
            limit: 30,
          }, controller.signal)
        : await squareApiClient.listSquare({
            kind,
            q: normalizedQuery,
            cursor: nextCursor,
            limit: 30,
          }, controller.signal)
      if (version !== requestVersion.current || controller.signal.aborted) return
      setItems((current) => {
        const ids = new Set(current.map((item) => item.id))
        return [...current, ...result.items.filter((item) => !ids.has(item.id))]
      })
      setNextCursor(result.nextCursor)
    } catch (loadError) {
      if (version !== requestVersion.current || controller.signal.aborted) return
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      if (version === requestVersion.current) {
        loadingMoreVersion.current = null
        setIsLoadingMore(false)
      }
    }
  }, [configured, isLoading, kind, nextCursor, normalizedQuery])

  useEffect(() => {
    void loadFirstPage()
    return () => {
      requestVersion.current += 1
      pageAbort.current?.abort()
      moreAbort.current?.abort()
    }
  }, [loadFirstPage])

  return {
    items,
    nextCursor,
    isLoading,
    isLoadingMore,
    error,
    configured,
    reload: loadFirstPage,
    loadMore,
  }
}
