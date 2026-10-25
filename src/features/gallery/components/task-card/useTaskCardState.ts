import { useEffect, useRef, useState, type TouchEventHandler } from 'react'
import type { TaskRecord } from '@/types'
import { formatImageRatio } from '@/lib/size'
import { TOUCH_ACTION_REVEAL_DELAY } from './shared'
import { useImageAssetView } from '@/hooks/useImageAssetView'
import { useNearViewport } from '@/hooks/useNearViewport'
import { useTaskPartialPreview } from '@/hooks/useTaskPartialPreview'

interface UseTaskCardStateOptions {
  preferredImageVariant?: 'thumbnail' | 'original'
  loadPreferredImageWhenVisible?: boolean
  preferredVisibleRootMargin?: string
  loadThumbnailWhenVisible?: boolean
  thumbnailVisibleRootMargin?: string
}

export function useTaskCardState(task: TaskRecord, options: UseTaskCardStateOptions = {}) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const touchRevealTimerRef = useRef<number | null>(null)
  const suppressNextClickRef = useRef(false)

  const [coverRatio, setCoverRatio] = useState('')
  const [coverSize, setCoverSize] = useState('')
  const [now, setNow] = useState(Date.now())
  const [touchActionsVisible, setTouchActionsVisible] = useState(false)
  const preferredImageVariant = options.preferredImageVariant ?? 'thumbnail'
  const loadPreferredImageWhenVisible = Boolean(options.loadPreferredImageWhenVisible)
  const loadThumbnailWhenVisible = Boolean(options.loadThumbnailWhenVisible)
  const shouldGatePreferredImage =
    preferredImageVariant === 'original' && loadPreferredImageWhenVisible
  const shouldGateThumbnail = loadThumbnailWhenVisible
  const isNearThumbnailViewport = useNearViewport(cardRef, {
    rootMargin: options.thumbnailVisibleRootMargin ?? '900px 0px',
    disabled: !shouldGateThumbnail,
  })
  const isNearPreferredViewport = useNearViewport(cardRef, {
    rootMargin: options.preferredVisibleRootMargin ?? '240px 0px',
    disabled: !shouldGatePreferredImage,
  })

  const coverImageId =
    task.status === 'running'
      ? task.outputImages?.[task.outputImages.length - 1] || ''
      : task.outputImages?.[0] || ''
  const partialPreviewUrl = useTaskPartialPreview(task.status === 'running' ? task.id : null)
  const { url: thumbnailSrc, metadata: thumbnailMetadata } = useImageAssetView(
    !shouldGateThumbnail || isNearThumbnailViewport ? coverImageId : '',
    {
      variant: 'thumbnail',
      includeMetadata: true,
      inferMetadataFromUrl: true,
    },
  )
  const { url: preferredSrc, metadata: preferredMetadata } = useImageAssetView(
    preferredImageVariant === 'original' && (!shouldGatePreferredImage || isNearPreferredViewport)
      ? coverImageId
      : '',
    {
      variant: preferredImageVariant,
      includeMetadata: true,
      inferMetadataFromUrl: true,
    },
  )
  const displaySrc =
    task.status === 'running'
      ? preferredSrc || thumbnailSrc || partialPreviewUrl
      : preferredImageVariant === 'original' ? preferredSrc || thumbnailSrc : thumbnailSrc
  const coverMetadata =
    preferredImageVariant === 'original'
      ? preferredMetadata ?? thumbnailMetadata
      : thumbnailMetadata

  useEffect(() => {
    if (task.status !== 'running') return

    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [task.status])

  useEffect(() => {
    if (!displaySrc || !coverImageId || !coverMetadata) {
      setCoverRatio('')
      setCoverSize('')
      return
    }

    setCoverRatio(formatImageRatio(coverMetadata.width, coverMetadata.height))
    setCoverSize(`${coverMetadata.width}×${coverMetadata.height}`)
  }, [coverImageId, coverMetadata, displaySrc])

  useEffect(() => {
    if (!touchActionsVisible) return

    const handleOutsideTouch = (event: TouchEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) {
        setTouchActionsVisible(false)
      }
    }

    document.addEventListener('touchstart', handleOutsideTouch, { passive: true })
    return () => document.removeEventListener('touchstart', handleOutsideTouch)
  }, [touchActionsVisible])

  useEffect(
    () => () => {
      if (touchRevealTimerRef.current != null) {
        window.clearTimeout(touchRevealTimerRef.current)
      }
    },
    [],
  )

  const duration = (() => {
    let seconds: number
    if (task.status === 'running') {
      seconds = Math.floor((now - task.createdAt) / 1000)
    } else if (task.elapsed != null) {
      seconds = Math.floor(task.elapsed / 1000)
    } else {
      return '00:00'
    }

    const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
    const ss = String(seconds % 60).padStart(2, '0')
    return `${mm}:${ss}`
  })()

  const clearTouchRevealTimer = () => {
    if (touchRevealTimerRef.current != null) {
      window.clearTimeout(touchRevealTimerRef.current)
      touchRevealTimerRef.current = null
    }
  }

  const closeTouchActions = () => {
    setTouchActionsVisible(false)
  }

  const consumeCardClick = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return false
    }
    return true
  }

  const handleTouchStart: TouchEventHandler<HTMLDivElement> = (event) => {
    if (event.touches.length !== 1) return

    suppressNextClickRef.current = false
    clearTouchRevealTimer()
    touchRevealTimerRef.current = window.setTimeout(() => {
      suppressNextClickRef.current = true
      setTouchActionsVisible(true)
    }, TOUCH_ACTION_REVEAL_DELAY)
  }

  const handleTouchMove: TouchEventHandler<HTMLDivElement> = () => {
    clearTouchRevealTimer()
  }

  const handleTouchEnd: TouchEventHandler<HTMLDivElement> = () => {
    clearTouchRevealTimer()
  }

  return {
    cardRef,
    thumbSrc: displaySrc,
    coverMetadata,
    coverRatio,
    coverSize,
    duration,
    isPreferredImageReady: preferredImageVariant === 'original' ? Boolean(preferredSrc) : true,
    touchActionsVisible,
    closeTouchActions,
    consumeCardClick,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  }
}
