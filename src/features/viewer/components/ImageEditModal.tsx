import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  applyImageEditToInput,
  closeImageEditor,
  ensureImageCached,
  getCachedImage,
  useStore,
} from '../../../store'
import type { ImageEditSelection } from '../../../types'
import { useCloseOnEscape } from '../../../hooks/useCloseOnEscape'
import Select from '../../../shared/components/Select'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function isPointInsideSelection(selection: ImageEditSelection, x: number, y: number) {
  return (
    x >= selection.x &&
    x <= selection.x + selection.width &&
    y >= selection.y &&
    y <= selection.y + selection.height
  )
}

function createMaskFromSelection(
  width: number,
  height: number,
  selection: ImageEditSelection | null,
): string | undefined {
  if (!selection) return undefined

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('蒙版画布初始化失败')
  }

  const selectionLeft = clamp(Math.round(selection.x * width), 0, width)
  const selectionTop = clamp(Math.round(selection.y * height), 0, height)
  const selectionWidth = clamp(Math.round(selection.width * width), 1, width - selectionLeft)
  const selectionHeight = clamp(Math.round(selection.height * height), 1, height - selectionTop)
  // GPT Image 编辑蒙版更适合使用“透明底 + 选区实心”形式，避免把整张黑底作为像素内容传过去。
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#ffffff'
  context.fillRect(selectionLeft, selectionTop, selectionWidth, selectionHeight)

  return canvas.toDataURL('image/png')
}

export default function ImageEditModal() {
  const imageEditSession = useStore((state) => state.imageEditSession)
  const providers = useStore((state) => state.providers)
  const activeProviderId = useStore((state) => state.activeProviderId)
  const [promptDraft, setPromptDraft] = useState('')
  const [providerDraft, setProviderDraft] = useState('')
  const [selection, setSelection] = useState<ImageEditSelection | null>(null)
  const selectionRef = useRef<ImageEditSelection | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [currentImageSrc, setCurrentImageSrc] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [displayRect, setDisplayRect] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const dragStateRef = useRef<
    | {
        pointerId: number
        mode: 'draw' | 'move'
        startX: number
        startY: number
        startSelection: ImageEditSelection | null
      }
    | null
  >(null)

  useCloseOnEscape(Boolean(imageEditSession), closeImageEditor)

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
  const displayImageSrc =
    currentImageSrc ||
    (imageEditSession && currentImageId === imageEditSession.sourceImageId
      ? imageEditSession.sourceImageDataUrl
      : '')

  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

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
    setNaturalSize(null)
    setIsSubmitting(false)
    setCurrentImageIndex(preferredIndex)
    setCurrentImageSrc(imageEditSession.sourceImageDataUrl)
    setDisplayRect({ left: 0, top: 0, width: 0, height: 0 })
  }, [activeProviderId, imageEditSession])

  useEffect(() => {
    if (!imageEditSession || !currentImageId) {
      setCurrentImageSrc('')
      setNaturalSize(null)
      setDisplayRect({ left: 0, top: 0, width: 0, height: 0 })
      return
    }

    let cancelled = false
    setNaturalSize(null)
    setDisplayRect({ left: 0, top: 0, width: 0, height: 0 })
    setSelection(
      currentImageId === imageEditSession.sourceImageId
        ? imageEditSession.initialSelection ?? null
        : null,
    )

    if (currentImageId === imageEditSession.sourceImageId) {
      setCurrentImageSrc(imageEditSession.sourceImageDataUrl)
      return () => {
        cancelled = true
      }
    }

    const cachedImage = getCachedImage(currentImageId)
    if (cachedImage) {
      setCurrentImageSrc(cachedImage)
      return () => {
        cancelled = true
      }
    }

    setCurrentImageSrc('')
    void ensureImageCached(currentImageId)
      .then((imageUrl) => {
        if (!cancelled) {
          setCurrentImageSrc(imageUrl ?? '')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentImageSrc('')
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentImageId, imageEditSession])

  useEffect(() => {
    if (!imageEditSession) return

    const updateDisplayRect = () => {
      const panel = panelRef.current
      const image = imageRef.current
      if (!panel || !image) return

      const panelRect = panel.getBoundingClientRect()
      const imageRect = image.getBoundingClientRect()
      setDisplayRect({
        left: imageRect.left - panelRect.left,
        top: imageRect.top - panelRect.top,
        width: imageRect.width,
        height: imageRect.height,
      })
    }

    updateDisplayRect()
    window.addEventListener('resize', updateDisplayRect)
    return () => window.removeEventListener('resize', updateDisplayRect)
  }, [imageEditSession, naturalSize])

  const selectionStyle = useMemo(() => {
    if (!selection) return null
    return {
      left: `${selection.x * 100}%`,
      top: `${selection.y * 100}%`,
      width: `${selection.width * 100}%`,
      height: `${selection.height * 100}%`,
    }
  }, [selection])

  const selectionPixelInfo = useMemo(() => {
    if (!selection || !naturalSize) return null
    return {
      width: Math.max(1, Math.round(selection.width * naturalSize.width)),
      height: Math.max(1, Math.round(selection.height * naturalSize.height)),
    }
  }, [naturalSize, selection])
  const providerOptions = useMemo(
    () =>
      providers.map((provider) => ({
        label: provider.name,
        value: provider.id,
      })),
    [providers],
  )
  const selectedProviderId = providerDraft || imageEditSession?.providerId || activeProviderId

  const modeLabel = selection ? '局部编辑' : '整图编辑'

  if (!imageEditSession) return null

  const switchImage = (direction: -1 | 1) => {
    if (!totalImageCount) return
    setCurrentImageSrc('')
    setNaturalSize(null)
    setDisplayRect({ left: 0, top: 0, width: 0, height: 0 })
    setCurrentImageIndex((index) => (index + direction + totalImageCount) % totalImageCount)
  }

  const readNormalizedPoint = (clientX: number, clientY: number) => {
    if (!overlayRef.current) return null
    const rect = overlayRef.current.getBoundingClientRect()
    if (!rect.width || !rect.height) return null

    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    }
  }

  const finishDrag = () => {
    const dragState = dragStateRef.current
    dragStateRef.current = null
    const currentSelection = selectionRef.current
    if (
      dragState?.mode === 'draw' &&
      currentSelection &&
      (currentSelection.width < 0.01 || currentSelection.height < 0.01)
    ) {
      setSelection(null)
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const point = readNormalizedPoint(event.clientX, event.clientY)
    if (!point) return

    event.preventDefault()
    const currentSelection = selectionRef.current
    const nextMode =
      currentSelection && isPointInsideSelection(currentSelection, point.x, point.y)
        ? 'move'
        : 'draw'
    dragStateRef.current = {
      pointerId: event.pointerId,
      mode: nextMode,
      startX: point.x,
      startY: point.y,
      startSelection: currentSelection,
    }

    if (nextMode === 'draw') {
      setSelection({
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
      })
    }

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    const point = readNormalizedPoint(event.clientX, event.clientY)
    if (!point) return

    if (dragState.mode === 'draw') {
      const left = Math.min(dragState.startX, point.x)
      const top = Math.min(dragState.startY, point.y)
      const width = Math.abs(point.x - dragState.startX)
      const height = Math.abs(point.y - dragState.startY)
      setSelection({
        x: left,
        y: top,
        width,
        height,
      })
      return
    }

    if (!dragState.startSelection) return
    const offsetX = dragState.startSelection.x - dragState.startX
    const offsetY = dragState.startSelection.y - dragState.startY
    const nextX = clamp(point.x + offsetX, 0, 1 - dragState.startSelection.width)
    const nextY = clamp(point.y + offsetY, 0, 1 - dragState.startSelection.height)
    setSelection({
      ...dragState.startSelection,
      x: nextX,
      y: nextY,
    })
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    finishDrag()
  }

  const handleApply = async (submit: boolean) => {
    if (!naturalSize || isSubmitting || !currentImageId || !displayImageSrc) return

    setIsSubmitting(true)
    try {
      const maskDataUrl = createMaskFromSelection(naturalSize.width, naturalSize.height, selection)
      await applyImageEditToInput({
        session: {
          ...imageEditSession,
          sourceImageId: currentImageId,
          sourceImageDataUrl: displayImageSrc,
          sourceImageIds: availableImageIds,
        },
        prompt: promptDraft,
        providerId: selectedProviderId,
        maskDataUrl,
        selection,
        sourceSize: `${naturalSize.width}x${naturalSize.height}`,
        submit,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      data-image-edit-root
      className="fixed inset-0 z-[85] flex items-center justify-center p-4"
      onClick={closeImageEditor}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-overlay-in" />
      <div
        className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#121214] shadow-2xl animate-modal-in lg:flex-row"
        onClick={(event) => event.stopPropagation()}
      >
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
              onLoad={(event) => {
                setNaturalSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
                const panel = panelRef.current
                const image = imageRef.current
                if (!panel || !image) return
                const panelRect = panel.getBoundingClientRect()
                const imageRect = image.getBoundingClientRect()
                setDisplayRect({
                  left: imageRect.left - panelRect.left,
                  top: imageRect.top - panelRect.top,
                  width: imageRect.width,
                  height: imageRect.height,
                })
              }}
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
                onClick={() => switchImage(-1)}
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
                onClick={() => switchImage(1)}
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
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={finishDrag}
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

        <div className="w-full border-t border-white/8 bg-[#17171b] p-5 lg:w-[26rem] lg:border-l lg:border-t-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">局部编辑</p>
              <h3 className="mt-2 text-xl font-semibold text-white">编辑输出图</h3>
              <p className="mt-2 text-sm text-white/55">
                当前模式：{modeLabel}
                {naturalSize ? ` · 原图 ${naturalSize.width}×${naturalSize.height}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={closeImageEditor}
              className="rounded-full p-2 text-white/45 transition hover:bg-white/8 hover:text-white"
              aria-label="关闭"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="mb-2 text-xs text-white/45">供应商</div>
              <Select
                value={selectedProviderId}
                onChange={(value) => setProviderDraft(String(value))}
                options={providerOptions}
                className="rounded-2xl border border-white/8 bg-[#0f1013] px-4 py-3 text-sm text-white"
              />
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="mb-2 text-xs text-white/45">编辑提示词</div>
              <textarea
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                rows={5}
                placeholder="描述你希望这个区域被改成什么样..."
                className="w-full resize-none rounded-2xl border border-white/8 bg-[#0f1013] px-4 py-3 text-sm leading-relaxed text-white outline-none transition focus:border-emerald-400/60"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-white/55">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                <div className="text-white/35">来源任务</div>
                <div className="mt-1 break-all font-mono text-white/80">{imageEditSession.taskId}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                <div className="text-white/35">当前图片</div>
                <div className="mt-1 text-white/80">
                  {currentImageNumber} / {displayImageCount}
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                <div className="text-white/35">选区状态</div>
                <div className="mt-1 text-white/80">{selection ? '已选定局部区域' : '未选区，将整图编辑'}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelection(null)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/8 hover:text-white"
              >
                清空选区
              </button>
              <button
                type="button"
                onClick={() => setPromptDraft(imageEditSession.prompt)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/8 hover:text-white"
              >
                恢复原提示词
              </button>
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={closeImageEditor}
              className="flex-1 rounded-2xl bg-white/8 px-4 py-3 text-sm font-medium text-white/75 transition hover:bg-white/12 hover:text-white"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                void handleApply(false)
              }}
              disabled={!naturalSize || isSubmitting}
              className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              应用到输入区
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleApply(true)
            }}
            disabled={!naturalSize || isSubmitting}
            className="mt-2 w-full rounded-2xl border border-emerald-400/25 bg-emerald-400/12 px-4 py-3 text-sm font-medium text-emerald-300 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-45"
          >
            立即提交编辑
          </button>
        </div>
      </div>
    </div>
  )
}
