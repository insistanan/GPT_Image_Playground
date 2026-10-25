import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ImageEditSelection, ImageEditSession } from '@/types'
import { createEmptyDisplayRect, type ImageDisplayRect, type ImageNaturalSize } from './shared'
import { useImageAssetView } from '@/hooks/useImageAssetView'

export function useImageEditState(imageEditSession: ImageEditSession | null, activeProviderId: string) {
  const [promptDraft, setPromptDraft] = useState('')
  const [providerDraft, setProviderDraft] = useState('')
  const [selection, setSelection] = useState<ImageEditSelection | null>(null)
  const [naturalSize, setNaturalSize] = useState<ImageNaturalSize | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [currentImageSrc, setCurrentImageSrc] = useState('')
  const [displayRect, setDisplayRect] = useState<ImageDisplayRect>(createEmptyDisplayRect)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const availableImageIds = useMemo(() => {
    const mergedIds = [
      imageEditSession?.sourceImageId ?? '',
      ...(imageEditSession?.sourceImageIds ?? []),
    ]
    return Array.from(
      new Set(
        mergedIds.filter((imageId): imageId is string => typeof imageId === 'string' && Boolean(imageId.trim())),
      ),
    )
  }, [imageEditSession])

  const totalImageCount = availableImageIds.length
  const displayImageCount = Math.max(totalImageCount, 1)
  const currentImageNumber = totalImageCount ? currentImageIndex + 1 : 1
  const hasMultipleImages = totalImageCount > 1
  const currentImageId = availableImageIds[currentImageIndex] ?? imageEditSession?.sourceImageId ?? ''
  const isCurrentSourceImage = Boolean(
    imageEditSession && currentImageId === imageEditSession.sourceImageId,
  )
  const { url: loadedImageSrc } = useImageAssetView(isCurrentSourceImage ? null : currentImageId)
  const displayImageSrc =
    currentImageSrc ||
    (imageEditSession && isCurrentSourceImage
      ? imageEditSession.sourceImageDataUrl
      : '')

  const resetImageViewport = useCallback(() => {
    setNaturalSize(null)
    setDisplayRect(createEmptyDisplayRect())
  }, [])

  useEffect(() => {
    if (!imageEditSession) return

    const initialImageIds = [
      imageEditSession.sourceImageId,
      ...(imageEditSession.sourceImageIds ?? []),
    ].filter((imageId): imageId is string => Boolean(imageId))
    const dedupedImageIds = Array.from(new Set(initialImageIds))
    const preferredIndex = Math.max(0, dedupedImageIds.indexOf(imageEditSession.sourceImageId))

    setPromptDraft(imageEditSession.prompt)
    setProviderDraft(imageEditSession.providerId ?? activeProviderId)
    setSelection(imageEditSession.initialSelection ?? null)
    setIsSubmitting(false)
    setCurrentImageIndex(preferredIndex)
    setCurrentImageSrc(imageEditSession.sourceImageDataUrl)
    resetImageViewport()
  }, [activeProviderId, imageEditSession, resetImageViewport])

  useEffect(() => {
    if (!imageEditSession || !currentImageId) {
      setCurrentImageSrc('')
      resetImageViewport()
      return
    }

    resetImageViewport()
    setSelection(
      currentImageId === imageEditSession.sourceImageId
        ? imageEditSession.initialSelection ?? null
        : null,
    )

    if (currentImageId === imageEditSession.sourceImageId) {
      setCurrentImageSrc(imageEditSession.sourceImageDataUrl)
      return
    }

    setCurrentImageSrc(loadedImageSrc)
  }, [currentImageId, imageEditSession, loadedImageSrc, resetImageViewport])

  const updateDisplayRect = useCallback(() => {
    const panel = panelRef.current
    const image = imageRef.current
    if (!panel || !image) return

    const nextRect = {
      left: image.offsetLeft,
      top: image.offsetTop,
      width: image.offsetWidth,
      height: image.offsetHeight,
    }

    setDisplayRect((previous) => {
      if (
        previous.left === nextRect.left &&
        previous.top === nextRect.top &&
        previous.width === nextRect.width &&
        previous.height === nextRect.height
      ) {
        return previous
      }

      return nextRect
    })
  }, [])

  useEffect(() => {
    if (!imageEditSession) return

    updateDisplayRect()
    window.addEventListener('resize', updateDisplayRect)
    return () => window.removeEventListener('resize', updateDisplayRect)
  }, [imageEditSession, naturalSize, updateDisplayRect])

  const measureLoadedImage = useCallback(() => {
    const image = imageRef.current
    if (!image || !image.naturalWidth || !image.naturalHeight) return

    setNaturalSize((previous) => {
      if (
        previous &&
        previous.width === image.naturalWidth &&
        previous.height === image.naturalHeight
      ) {
        return previous
      }

      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
      }
    })
    updateDisplayRect()
  }, [updateDisplayRect])

  useEffect(() => {
    if (!displayImageSrc || (naturalSize && displayRect.width > 0 && displayRect.height > 0)) {
      return
    }

    const image = imageRef.current
    if (!image?.complete) return

    const frameId = window.requestAnimationFrame(measureLoadedImage)
    return () => window.cancelAnimationFrame(frameId)
  }, [displayImageSrc, displayRect.height, displayRect.width, measureLoadedImage, naturalSize])

  const handleImageLoad = useCallback(() => {
    measureLoadedImage()
  }, [measureLoadedImage])

  const switchImage = useCallback(
    (direction: -1 | 1) => {
      if (!totalImageCount) return

      setCurrentImageSrc('')
      resetImageViewport()
      setCurrentImageIndex((index) => (index + direction + totalImageCount) % totalImageCount)
    },
    [resetImageViewport, totalImageCount],
  )

  return {
    promptDraft,
    setPromptDraft,
    providerDraft,
    setProviderDraft,
    selection,
    setSelection,
    naturalSize,
    isSubmitting,
    setIsSubmitting,
    displayRect,
    panelRef,
    imageRef,
    availableImageIds,
    displayImageCount,
    currentImageNumber,
    hasMultipleImages,
    currentImageId,
    displayImageSrc,
    handleImageLoad,
    switchImage,
  }
}
