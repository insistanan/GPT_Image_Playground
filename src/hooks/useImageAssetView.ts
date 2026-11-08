import { useEffect, useState } from 'react'
import type { ImageAssetView, ImageAssetViewOptions } from '@/store/imageAssets'
import { getImageView } from '@/store'

export interface UseImageAssetViewResult {
  imageId: string
  view: ImageAssetView | null
  url: string
  metadata: ImageAssetView['metadata']
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

function shouldLoadMetadata(options: ImageAssetViewOptions): boolean {
  return Boolean(options.includeMetadata || options.inferMetadataFromUrl)
}

export function useImageAssetView(
  imageId: string | null | undefined,
  options: ImageAssetViewOptions = {},
): UseImageAssetViewResult {
  const [resolvedKey, setResolvedKey] = useState('')
  const [view, setView] = useState<ImageAssetView | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const normalizedImageId =
    typeof imageId === 'string' && imageId.trim() ? imageId.trim() : ''
  const variant = options.variant ?? 'original'
  const includeMetadata = Boolean(options.includeMetadata)
  const inferMetadataFromUrl = Boolean(options.inferMetadataFromUrl)
  const metadataRequested = shouldLoadMetadata(options)
  const viewKey = `${normalizedImageId}:${variant}:${includeMetadata}:${inferMetadataFromUrl}`

  useEffect(() => {
    setError(null)
    if (!normalizedImageId) {
      setResolvedKey(viewKey)
      setView(null)
      setStatus('idle')
      return
    }

    let cancelled = false
    const viewOptions: ImageAssetViewOptions = {
      variant,
      includeMetadata,
      inferMetadataFromUrl,
    }
    const handle = getImageView(normalizedImageId, variant)
    const cachedView = handle.displayUrl
      ? { url: handle.displayUrl, metadata: metadataRequested ? handle.metadata : null } as ImageAssetView
      : null
    if (cachedView && (!metadataRequested || cachedView.metadata)) {
      setResolvedKey(viewKey)
      setView(cachedView)
      setStatus('ready')
      return () => {
        cancelled = true
      }
    }

    setResolvedKey(viewKey)
    if (cachedView) {
      setView(cachedView)
    } else {
      setView(null)
    }
    setStatus('loading')

    void handle.reload(viewOptions).then(h => h.displayUrl ? { url: h.displayUrl, metadata: metadataRequested ? h.metadata : null } as ImageAssetView : null)
      .then((nextView) => {
        if (cancelled) {
          return
        }

        if (nextView) {
          setView(nextView)
          setStatus('ready')
          return
        }

        setView(null)
        setStatus('error')
        setError('图片资产不存在或没有可用地址')
      })
      .catch((loadError) => {
        if (!cancelled) {
          setView(null)
          setStatus('error')
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    includeMetadata,
    inferMetadataFromUrl,
    metadataRequested,
    normalizedImageId,
    variant,
    viewKey,
  ])

  const isCurrentView = resolvedKey === viewKey

  return {
    imageId: isCurrentView ? normalizedImageId : '',
    view: isCurrentView ? view : null,
    url: isCurrentView ? view?.url ?? '' : '',
    metadata: isCurrentView ? view?.metadata ?? null : null,
    status: isCurrentView ? status : normalizedImageId ? 'loading' : 'idle',
    error: isCurrentView ? error : null,
  }
}
