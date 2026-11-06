import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { clamp, type ImageNaturalSize } from './shared'

interface UseImageMarkupCanvasOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>
  overlayRef: RefObject<HTMLDivElement | null>
  naturalSize: ImageNaturalSize | null
  enabled: boolean
  initialDataUrl?: string | null
}

interface MarkupStrokeState {
  pointerId: number
  x: number
  y: number
}

const MARKUP_STROKE_COLOR = '#ff3b30'

/**
 * 标注画布：在图上自由绘制红色线条，导出为与原图同尺寸的透明 PNG。
 * 产出直接对应 Images 编辑端点的 markup 参数，因此尺寸必须与原图一致。
 */
export function useImageMarkupCanvas(options: UseImageMarkupCanvasOptions) {
  const { canvasRef, overlayRef, naturalSize, enabled, initialDataUrl } = options
  const [hasInk, setHasInk] = useState(false)
  const strokeRef = useRef<MarkupStrokeState | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !naturalSize || !enabled) {
      return
    }

    canvas.width = naturalSize.width
    canvas.height = naturalSize.height
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    strokeRef.current = null
    setHasInk(false)
  }, [canvasRef, enabled, naturalSize?.width, naturalSize?.height])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !naturalSize || !enabled || !initialDataUrl) {
      return
    }

    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) {
        return
      }
      const context = canvas.getContext('2d')
      if (!context) {
        return
      }
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      setHasInk(true)
    }
    image.src = initialDataUrl

    return () => {
      cancelled = true
    }
  }, [canvasRef, enabled, initialDataUrl, naturalSize?.width, naturalSize?.height])

  const readNormalizedPoint = (clientX: number, clientY: number) => {
    const overlay = overlayRef.current
    if (!overlay) {
      return null
    }

    const rect = overlay.getBoundingClientRect()
    if (!rect.width || !rect.height) {
      return null
    }

    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    }
  }

  const configureContext = (canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d')
    if (!context) {
      return null
    }

    const lineWidth = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.004))
    context.strokeStyle = MARKUP_STROKE_COLOR
    context.fillStyle = MARKUP_STROKE_COLOR
    context.lineWidth = lineWidth
    context.lineCap = 'round'
    context.lineJoin = 'round'
    return context
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0) {
      return
    }

    const point = readNormalizedPoint(event.clientX, event.clientY)
    const canvas = canvasRef.current
    if (!point || !canvas) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)

    const context = configureContext(canvas)
    if (!context) {
      return
    }

    const x = point.x * canvas.width
    const y = point.y * canvas.height
    context.beginPath()
    context.arc(x, y, context.lineWidth / 2, 0, Math.PI * 2)
    context.fill()

    strokeRef.current = { pointerId: event.pointerId, x: point.x, y: point.y }
    setHasInk(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stroke = strokeRef.current
    const canvas = canvasRef.current
    if (!enabled || !stroke || stroke.pointerId !== event.pointerId || !canvas) {
      return
    }

    const point = readNormalizedPoint(event.clientX, event.clientY)
    const context = configureContext(canvas)
    if (!point || !context) {
      return
    }

    context.beginPath()
    context.moveTo(stroke.x * canvas.width, stroke.y * canvas.height)
    context.lineTo(point.x * canvas.width, point.y * canvas.height)
    context.stroke()

    strokeRef.current = { pointerId: event.pointerId, x: point.x, y: point.y }
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (strokeRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    strokeRef.current = null
  }

  const clearMarkup = () => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    }
    strokeRef.current = null
    setHasInk(false)
  }

  const exportMarkup = (): string | undefined => {
    const canvas = canvasRef.current
    if (!enabled || !hasInk || !canvas) {
      return undefined
    }
    return canvas.toDataURL('image/png')
  }

  return {
    hasInk,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel: handlePointerUp,
    clearMarkup,
    exportMarkup,
  }
}
