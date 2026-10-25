import { useCloseOnEscape } from '@/hooks/useCloseOnEscape'
import LightboxViewport from './LightboxViewport'
import { useLightboxState } from './useLightboxState'
import { useLightboxTransform } from './useLightboxTransform'

export default function Lightbox() {
  const { lightboxImageId, src, close, showNav, currentIndex, total, goPrev, goNext } = useLightboxState()

  useCloseOnEscape(Boolean(lightboxImageId), close)

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
    src,
    onClose: close,
  })

  if (!lightboxImageId || !src) return null

  return (
    <LightboxViewport
      src={src}
      onClose={close}
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
