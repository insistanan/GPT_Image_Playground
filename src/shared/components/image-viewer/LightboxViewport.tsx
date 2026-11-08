import type { CSSProperties, MouseEventHandler, PointerEventHandler, RefObject } from 'react'

interface LightboxViewportProps {
  src: string
  onClose: () => void
  showNav: boolean
  currentIndex: number
  total: number
  isZoomed: boolean
  isDragging: boolean
  showZoomBadge: boolean
  zoomPercent: number
  containerRef: RefObject<HTMLDivElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  imageStyle: CSSProperties
  onBackdropClick: MouseEventHandler<HTMLDivElement>
  onStageDoubleClick: MouseEventHandler<HTMLDivElement>
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerUp: PointerEventHandler<HTMLDivElement>
  onPointerCancel: PointerEventHandler<HTMLDivElement>
  onPrev: () => void
  onNext: () => void
}

export default function LightboxViewport(props: LightboxViewportProps) {
  const {
    src,
    onClose,
    showNav,
    currentIndex,
    total,
    isZoomed,
    isDragging,
    showZoomBadge,
    zoomPercent,
    containerRef,
    stageRef,
    imageStyle,
    onBackdropClick,
    onStageDoubleClick,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPrev,
    onNext,
  } = props

  const navButtonClass =
    'absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition-all hover:bg-black/60'
  const closeButtonClass =
    'absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/45 p-2 text-white/90 shadow-lg backdrop-blur-md transition hover:bg-black/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40 sm:right-5 sm:top-5'

  return (
    <div
      ref={containerRef}
      data-lightbox-root
      className="fixed inset-0 z-[90] flex select-none items-center justify-center"
      style={{
        cursor: isZoomed ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
        overscrollBehavior: 'none',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-md"
        onClick={onBackdropClick}
      />
      <button
        type="button"
        className={closeButtonClass}
        aria-label="关闭大图"
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      >
        <svg className="h-5 w-5 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      {/* 图片容器 */}
      <div className="relative z-10 animate-zoom-in">
        <div
          ref={stageRef}
          data-lightbox-stage
          className="relative"
          style={{
            ...imageStyle,
            touchAction: 'none',
          }}
          onDoubleClick={onStageDoubleClick}
        >
          <img
            src={src}
            className="max-h-[85vh] max-w-[85vw] select-none rounded-lg object-contain shadow-2xl"
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            alt=""
          />
        </div>
      </div>

      {showNav && !isZoomed && (
        <>
          <button
            type="button"
            className={`${navButtonClass} left-3 sm:left-5`}
            onClick={(event) => {
              event.stopPropagation()
              onPrev()
            }}
          >
            <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            className={`${navButtonClass} right-3 sm:right-5`}
            onClick={(event) => {
              event.stopPropagation()
              onNext()
            }}
          >
            <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {showZoomBadge && isZoomed && zoomPercent !== 100 && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-black/50 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm transition-opacity duration-500">
            {zoomPercent}%
          </span>
        </div>
      )}

      {showNav && !isZoomed && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-black/50 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm">
            {currentIndex + 1} / {total}
          </span>
        </div>
      )}
    </div>
  )
}
