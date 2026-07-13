import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEventHandler,
  type PointerEventHandler,
} from 'react'
import { clamp, MAX_SCALE, MIN_SCALE } from './shared'

interface UseLightboxTransformOptions {
  src: string
  onClose: () => void
}

function isStageTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-lightbox-stage]'))
}

export function useLightboxTransform(options: UseLightboxTransformOptions) {
  const { src, onClose } = options
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const scaleRef = useRef(1)
  const txRef = useRef(0)
  const tyRef = useRef(0)
  const [, forceRender] = useState(0)
  const [showZoomBadge, setShowZoomBadge] = useState(false)
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragRef = useRef({
    active: false,
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    baseTx: 0,
    baseTy: 0,
  })
  const pinchRef = useRef({
    active: false,
    startDist: 0,
    startScale: 1,
    startTx: 0,
    startTy: 0,
    midX: 0,
    midY: 0,
  })
  const tapRef = useRef({ time: 0, x: 0, y: 0 })
  const hadMultiTouchRef = useRef(false)
  const touchStartedOnImageRef = useRef(false)
  const didDragRef = useRef(false)
  const suppressNextClickRef = useRef(false)

  const rerender = useCallback(() => {
    forceRender((count) => count + 1)
  }, [])

  useEffect(() => {
    scaleRef.current = 1
    txRef.current = 0
    tyRef.current = 0
    setShowZoomBadge(false)
    if (zoomTimerRef.current) {
      clearTimeout(zoomTimerRef.current)
    }
    rerender()
  }, [rerender, src])

  useEffect(() => {
    return () => {
      if (zoomTimerRef.current) {
        clearTimeout(zoomTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const suppressClick = () => {
      suppressNextClickRef.current = true
    }

    window.addEventListener('image-context-menu-dismiss-lightbox-click', suppressClick)
    return () => window.removeEventListener('image-context-menu-dismiss-lightbox-click', suppressClick)
  }, [])

  const getCenter = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) {
      return { cx: 0, cy: 0 }
    }

    return {
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
    }
  }, [])

  const apply = useCallback(
    (scale: number, tx: number, ty: number) => {
      const nextScale = clamp(scale, MIN_SCALE, MAX_SCALE)
      scaleRef.current = nextScale
      txRef.current = nextScale <= 1 ? 0 : tx
      tyRef.current = nextScale <= 1 ? 0 : ty

      if (nextScale > 1) {
        setShowZoomBadge(true)
        if (zoomTimerRef.current) {
          clearTimeout(zoomTimerRef.current)
        }
        zoomTimerRef.current = setTimeout(() => setShowZoomBadge(false), 1500)
      } else {
        setShowZoomBadge(false)
        if (zoomTimerRef.current) {
          clearTimeout(zoomTimerRef.current)
        }
      }

      rerender()
    },
    [rerender],
  )

  const zoomAtPoint = useCallback(
    (clientX: number, clientY: number, deltaY: number) => {
      const element = containerRef.current
      if (!element) return

      const scale = scaleRef.current
      const tx = txRef.current
      const ty = tyRef.current
      const rect = element.getBoundingClientRect()
      const mouseX = clientX - rect.left - rect.width / 2
      const mouseY = clientY - rect.top - rect.height / 2
      const factor = deltaY < 0 ? 1.15 : 1 / 1.15
      const nextScale = clamp(scale * factor, MIN_SCALE, MAX_SCALE)
      const ratio = nextScale / scale

      apply(nextScale, mouseX - ratio * (mouseX - tx), mouseY - ratio * (mouseY - ty))
    },
    [apply],
  )

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      // 只在 lightbox 打开时处理
      if (!containerRef.current) return
      event.preventDefault()
      event.stopPropagation()
      zoomAtPoint(event.clientX, event.clientY, event.deltaY)
    },
    [zoomAtPoint],
  )

  useEffect(() => {
    // 绑定在 window 上，确保无论鼠标在哪都能捕获 wheel 事件
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  const finishPointerDrag = useCallback((element: HTMLDivElement, pointerId: number) => {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId)
    }

    dragRef.current.active = false
    dragRef.current.pointerId = null
  }, [])

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = useCallback((event) => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
    if (event.button !== 0) return
    // 放宽条件：只要在容器内且不是点击导航按钮等，就可以拖拽
    // 不再要求必须点击到 stage 内的元素（因为图片有 pointer-events-none 会穿透）

    didDragRef.current = false
    if (scaleRef.current <= 1) return

    event.preventDefault()
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseTx: txRef.current,
      baseTy: tyRef.current,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove: PointerEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      const dragState = dragRef.current
      if (!dragState.active || dragState.pointerId !== event.pointerId) return

      const dx = event.clientX - dragState.startX
      const dy = event.clientY - dragState.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        didDragRef.current = true
      }
      apply(scaleRef.current, dragState.baseTx + dx, dragState.baseTy + dy)
    },
    [apply],
  )

  const handlePointerUp: PointerEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (dragRef.current.pointerId !== event.pointerId) return
      finishPointerDrag(event.currentTarget, event.pointerId)
    },
    [finishPointerDrag],
  )

  const handlePointerCancel: PointerEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (dragRef.current.pointerId !== event.pointerId) return
      finishPointerDrag(event.currentTarget, event.pointerId)
    },
    [finishPointerDrag],
  )

  const handleBackdropClick: MouseEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false
        event.stopPropagation()
        return
      }
      onClose()
    },
    [onClose],
  )

  const handleStageDoubleClick: MouseEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (!isStageTarget(event.target)) return
      event.stopPropagation()
      if (scaleRef.current > 1) {
        apply(1, 0, 0)
        return
      }

      const { cx, cy } = getCenter()
      const mouseX = event.clientX - cx
      const mouseY = event.clientY - cy
      apply(3, -mouseX * 2, -mouseY * 2)
    },
    [apply, getCenter],
  )

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        event.preventDefault()
        hadMultiTouchRef.current = true
        tapRef.current = { time: 0, x: 0, y: 0 }
        const [pointA, pointB] = [event.touches[0], event.touches[1]]
        const distance = Math.hypot(pointA.clientX - pointB.clientX, pointA.clientY - pointB.clientY)
        const { cx, cy } = getCenter()

        pinchRef.current = {
          active: true,
          startDist: distance,
          startScale: scaleRef.current,
          startTx: txRef.current,
          startTy: tyRef.current,
          midX: (pointA.clientX + pointB.clientX) / 2 - cx,
          midY: (pointA.clientY + pointB.clientY) / 2 - cy,
        }
        dragRef.current.active = false
        dragRef.current.pointerId = null
        return
      }

      if (event.touches.length !== 1) return

      const touch = event.touches[0]
      const now = Date.now()
      const previousTap = tapRef.current
      touchStartedOnImageRef.current = isStageTarget(event.target)

      if (
        now - previousTap.time < 300 &&
        Math.abs(touch.clientX - previousTap.x) < 30 &&
        Math.abs(touch.clientY - previousTap.y) < 30
      ) {
        event.preventDefault()
        if (scaleRef.current > 1) {
          apply(1, 0, 0)
        } else {
          const { cx, cy } = getCenter()
          const mouseX = touch.clientX - cx
          const mouseY = touch.clientY - cy
          apply(3, -mouseX * 2, -mouseY * 2)
        }
        tapRef.current = { time: 0, x: 0, y: 0 }
        return
      }

      tapRef.current = { time: now, x: touch.clientX, y: touch.clientY }
      if (scaleRef.current > 1 && touchStartedOnImageRef.current) {
        event.preventDefault()
        dragRef.current = {
          active: true,
          pointerId: null,
          startX: touch.clientX,
          startY: touch.clientY,
          baseTx: txRef.current,
          baseTy: tyRef.current,
        }
      }
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (pinchRef.current.active && event.touches.length === 2) {
        event.preventDefault()
        const [pointA, pointB] = [event.touches[0], event.touches[1]]
        const distance = Math.hypot(pointA.clientX - pointB.clientX, pointA.clientY - pointB.clientY)
        const pinchState = pinchRef.current
        const nextScale = clamp(
          pinchState.startScale * (distance / pinchState.startDist),
          MIN_SCALE,
          MAX_SCALE,
        )
        const ratio = nextScale / pinchState.startScale

        apply(
          nextScale,
          pinchState.midX - ratio * (pinchState.midX - pinchState.startTx),
          pinchState.midY - ratio * (pinchState.midY - pinchState.startTy),
        )
        return
      }

      if (dragRef.current.active && event.touches.length === 1) {
        event.preventDefault()
        const touch = event.touches[0]
        const dragState = dragRef.current

        apply(
          scaleRef.current,
          dragState.baseTx + touch.clientX - dragState.startX,
          dragState.baseTy + touch.clientY - dragState.startY,
        )
      }
    }

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        pinchRef.current.active = false
      }

      if (event.touches.length !== 0) return

      dragRef.current.active = false
      dragRef.current.pointerId = null
      if (hadMultiTouchRef.current) {
        hadMultiTouchRef.current = false
        tapRef.current = { time: 0, x: 0, y: 0 }
        return
      }

      if (scaleRef.current <= 1 || !touchStartedOnImageRef.current) {
        const previousTap = tapRef.current
        if (previousTap.time > 0 && Date.now() - previousTap.time < 300) {
          setTimeout(() => {
            if (tapRef.current.time === previousTap.time) {
              onClose()
            }
          }, 310)
        }
      }
    }

    element.addEventListener('touchstart', handleTouchStart, { passive: false })
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd)
    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
    }
    // 依赖 src：首帧 src 未就绪时容器尚未挂载，effect 会 early-return；
    // src 到位后组件才真正挂载 containerRef，需要借助 src 变化重新绑定触摸事件。
  }, [apply, getCenter, onClose, src])

  const scale = scaleRef.current
  const tx = txRef.current
  const ty = tyRef.current
  const isZoomed = scale > 1
  const isDragging = dragRef.current.active || pinchRef.current.active
  const zoomPercent = Math.round(scale * 100)
  const imageStyle: CSSProperties = {
    transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
    transition: isDragging ? 'none' : 'transform 0.2s ease-out',
    willChange: 'transform',
  }

  return {
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
  }
}
