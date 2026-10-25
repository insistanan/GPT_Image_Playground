import { useEffect, useMemo, useRef, type CSSProperties, type Dispatch, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from 'react'
import type { ImageEditSelection } from '@/types'
import {
  clamp,
  isPointInsideSelection,
  type ImageNaturalSize,
  type ImageSelectionPixelInfo,
} from './shared'

interface UseImageSelectionOverlayOptions {
  overlayRef: RefObject<HTMLDivElement | null>
  selection: ImageEditSelection | null
  setSelection: Dispatch<SetStateAction<ImageEditSelection | null>>
  naturalSize: ImageNaturalSize | null
}

interface DragState {
  pointerId: number
  mode: 'draw' | 'move'
  startX: number
  startY: number
  startSelection: ImageEditSelection | null
}

export function useImageSelectionOverlay(options: UseImageSelectionOverlayOptions) {
  const { overlayRef, selection, setSelection, naturalSize } = options
  const selectionRef = useRef<ImageEditSelection | null>(null)
  const dragStateRef = useRef<DragState | null>(null)

  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  const selectionStyle = useMemo<CSSProperties | null>(() => {
    if (!selection) return null

    return {
      left: `${selection.x * 100}%`,
      top: `${selection.y * 100}%`,
      width: `${selection.width * 100}%`,
      height: `${selection.height * 100}%`,
    }
  }, [selection])

  const selectionPixelInfo = useMemo<ImageSelectionPixelInfo | null>(() => {
    if (!selection || !naturalSize) return null

    return {
      width: Math.max(1, Math.round(selection.width * naturalSize.width)),
      height: Math.max(1, Math.round(selection.height * naturalSize.height)),
    }
  }, [naturalSize, selection])

  const readNormalizedPoint = (clientX: number, clientY: number) => {
    const overlay = overlayRef.current
    if (!overlay) return null

    const rect = overlay.getBoundingClientRect()
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

  return {
    selectionStyle,
    selectionPixelInfo,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel: finishDrag,
  }
}
