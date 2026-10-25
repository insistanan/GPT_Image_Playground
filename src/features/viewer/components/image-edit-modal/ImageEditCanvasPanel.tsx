import type { CSSProperties, PointerEventHandler, RefObject } from 'react'
import type { ImageEditSelection } from '@/types'
import type { ImageDisplayRect, ImageSelectionPixelInfo } from './shared'

interface ImageEditCanvasPanelProps {
  displayImageSrc: string
  hasMultipleImages: boolean
  currentImageNumber: number
  displayImageCount: number
  selection: ImageEditSelection | null
  selectionStyle: CSSProperties | null
  selectionPixelInfo: ImageSelectionPixelInfo | null
  displayRect: ImageDisplayRect
  panelRef: RefObject<HTMLDivElement | null>
  imageRef: RefObject<HTMLImageElement | null>
  overlayRef: RefObject<HTMLDivElement | null>
  onImageLoad: () => void
  onSwitchImage: (direction: -1 | 1) => void
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerUp: PointerEventHandler<HTMLDivElement>
  onPointerCancel: PointerEventHandler<HTMLDivElement>
}

export default function ImageEditCanvasPanel(props: ImageEditCanvasPanelProps) {
  const {
    displayImageSrc,
    hasMultipleImages,
    currentImageNumber,
    displayImageCount,
    selection,
    selectionStyle,
    selectionPixelInfo,
    displayRect,
    panelRef,
    imageRef,
    overlayRef,
    onImageLoad,
    onSwitchImage,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  } = props

  return (
    <div
      ref={panelRef}
      className="relative flex min-h-[22rem] flex-1 items-center justify-center overflow-hidden bg-[#0d0d10] p-4"
    >
      {displayImageSrc ? (
        <img
          ref={imageRef}
          src={displayImageSrc}
          alt=""
          draggable={false}
          className="max-h-[72vh] max-w-full select-none rounded-2xl object-contain shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
          onLoad={onImageLoad}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 text-center text-sm text-white/45">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-emerald-300" />
          <p>正在加载这张输出图…</p>
        </div>
      )}

      {hasMultipleImages && (
        <>
          <button
            type="button"
            onClick={() => onSwitchImage(-1)}
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/12 bg-black/45 p-3 text-white/80 backdrop-blur transition hover:bg-black/65 hover:text-white"
            aria-label="上一张输出图"
            title="上一张输出图"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onSwitchImage(1)}
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/12 bg-black/45 p-3 text-white/80 backdrop-blur transition hover:bg-black/65 hover:text-white"
            aria-label="下一张输出图"
            title="下一张输出图"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs font-medium text-white/85 backdrop-blur">
            当前输出图 {currentImageNumber} / {displayImageCount}
          </div>
        </>
      )}

      {displayImageSrc && displayRect.width > 0 && displayRect.height > 0 && (
        <div
          ref={overlayRef}
          className="absolute cursor-crosshair rounded-2xl touch-none select-none"
          style={{
            left: displayRect.left,
            top: displayRect.top,
            width: displayRect.width,
            height: displayRect.height,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {!selection && (
            <div className="pointer-events-none absolute inset-0 rounded-2xl border border-dashed border-white/25">
              <div className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs text-white/90 backdrop-blur">
                拖拽框出要修改的区域；直接应用则按整图编辑
              </div>
            </div>
          )}
          {selectionStyle && (
            <div
              className="pointer-events-none absolute rounded-2xl border border-emerald-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.46)]"
              style={selectionStyle}
            >
              <div className="absolute -top-8 left-0 rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-medium text-black shadow-lg">
                {selectionPixelInfo ? `${selectionPixelInfo.width}×${selectionPixelInfo.height}` : '局部编辑'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
