import { useCallback, useEffect } from 'react'
import { useCloseOnEscape } from '@/hooks/useCloseOnEscape'
import LightboxViewport from '@/features/viewer/components/lightbox/LightboxViewport'
import { useLightboxTransform } from '@/features/viewer/components/lightbox/useLightboxTransform'

export interface SquareLightboxImage {
  src: string
  title: string
}

interface SquareImageLightboxProps {
  images: SquareLightboxImage[]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onClose: () => void
}

export default function SquareImageLightbox({
  images,
  activeIndex,
  onActiveIndexChange,
  onClose,
}: SquareImageLightboxProps) {
  const total = images.length
  const currentIndex = total > 0
    ? Math.min(Math.max(activeIndex, 0), total - 1)
    : 0
  const activeImage = images[currentIndex] ?? null
  const showNav = total > 1

  useCloseOnEscape(Boolean(activeImage), onClose)

  const goTo = useCallback(
    (index: number) => {
      if (total === 0) return
      const wrappedIndex = ((index % total) + total) % total
      onActiveIndexChange(wrappedIndex)
    },
    [onActiveIndexChange, total],
  )

  const goPrev = useCallback(() => {
    goTo(currentIndex - 1)
  }, [currentIndex, goTo])

  const goNext = useCallback(() => {
    goTo(currentIndex + 1)
  }, [currentIndex, goTo])

  useEffect(() => {
    if (!activeImage || !showNav) return

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
  }, [activeImage, goNext, goPrev, showNav])

  const {
    containerRef,
    stageRef,
    imageStyle,
    isZoomed,
    isDragging,
    showZoomBadge,
    zoomPercent,
    handleBackdropClick,
    handleStageDoubleClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useLightboxTransform({
    src: activeImage?.src ?? '',
    onClose,
  })

  if (!activeImage) return null

  return (
    <LightboxViewport
      src={activeImage.src}
      onClose={onClose}
      showNav={showNav}
      currentIndex={currentIndex}
      total={total}
      isZoomed={isZoomed}
      isDragging={isDragging}
      showZoomBadge={showZoomBadge}
      zoomPercent={zoomPercent}
      containerRef={containerRef}
      stageRef={stageRef}
      imageStyle={imageStyle}
      onBackdropClick={handleBackdropClick}
      onStageDoubleClick={handleStageDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPrev={goPrev}
      onNext={goNext}
    />
  )
}
