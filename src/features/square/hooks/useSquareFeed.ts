import { useCallback, useEffect, useMemo, useState } from 'react'
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

  const resetKey = useMemo(() => `${kind}:${normalizedQuery}`, [kind, normalizedQuery])

  const loadFirstPage = useCallback(async () => {
    if (!configured) {
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
          })
        : await squareApiClient.listSquare({
            kind,
            q: normalizedQuery,
            limit: 30,
          })
      setItems(result.items)
      setNextCursor(result.nextCursor)
    } catch (loadError) {
      setItems([])
      setNextCursor(null)
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setIsLoading(false)
    }
  }, [configured, kind, normalizedQuery])

  const loadMore = useCallback(async () => {
    if (!configured || !nextCursor || isLoadingMore) return

    setIsLoadingMore(true)
    setError(null)
    try {
      const result = kind === 'mine'
        ? await squareApiClient.listMyShares({
            q: normalizedQuery,
            cursor: nextCursor,
            limit: 30,
          })
        : await squareApiClient.listSquare({
            kind,
            q: normalizedQuery,
            cursor: nextCursor,
            limit: 30,
          })
      setItems((current) => [...current, ...result.items])
      setNextCursor(result.nextCursor)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setIsLoadingMore(false)
    }
  }, [configured, isLoadingMore, kind, nextCursor, normalizedQuery])

  useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage, resetKey])

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
