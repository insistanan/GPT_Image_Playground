import { useCallback, useEffect, useState } from 'react'
import { closeLightbox, openLightbox, useStore } from '@/store'
import { useImageAssetView } from '@/hooks/useImageAssetView'

export function useLightboxState() {
  const lightboxImageId = useStore((state) => state.lightboxImageId)
  const lightboxImageList = useStore((state) => state.lightboxImageList)
  const currentIndex = lightboxImageId ? lightboxImageList.indexOf(lightboxImageId) : -1
  const activeImageId =
    currentIndex >= 0 ? lightboxImageList[currentIndex] : lightboxImageId
  const { url: src } = useImageAssetView(activeImageId)

  const close = useCallback(() => {
    closeLightbox()
  }, [])

  const total = lightboxImageList.length
  const showNav = total > 1 && currentIndex >= 0

  useEffect(() => {
    if (!lightboxImageId) {
      return
    }

    if (currentIndex >= 0) {
      return
    }

    closeLightbox()
  }, [currentIndex, lightboxImageId])

  const goTo = useCallback(
    (index: number) => {
      if (lightboxImageList.length === 0) return

      const wrappedIndex =
        ((index % lightboxImageList.length) + lightboxImageList.length) % lightboxImageList.length
      openLightbox(lightboxImageList[wrappedIndex], lightboxImageList)
    },
    [lightboxImageList],
  )

  const goPrev = useCallback(() => {
    if (!showNav) return
    goTo(currentIndex - 1)
  }, [currentIndex, goTo, showNav])

  const goNext = useCallback(() => {
    if (!showNav) return
    goTo(currentIndex + 1)
  }, [currentIndex, goTo, showNav])

  useEffect(() => {
    if (!lightboxImageId || !showNav) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goNext, goPrev, lightboxImageId, showNav])

  return {
    lightboxImageId,
    src,
    close,
    showNav,
    currentIndex,
    total,
    goPrev,
    goNext,
  }
}
