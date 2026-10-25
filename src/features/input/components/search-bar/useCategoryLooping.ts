import { useEffect, useRef, useState, type UIEventHandler } from 'react'
import type { TaskView } from '@/types'
import {
  CATEGORY_LOOP_MAX_SCROLL_RATIO,
  CATEGORY_LOOP_MIN_SCROLL_RATIO,
  type CategoryChipItem,
} from './shared'

interface UseCategoryLoopingOptions {
  isMobile: boolean
  taskView: TaskView
  categoryChipItems: CategoryChipItem[]
  categoryChipLayoutSignature: string
}

export function useCategoryLooping({
  isMobile,
  taskView,
  categoryChipItems,
  categoryChipLayoutSignature,
}: UseCategoryLoopingOptions) {
  const categoryViewportRef = useRef<HTMLDivElement | null>(null)
  const categorySegmentRef = useRef<HTMLDivElement | null>(null)
  const categorySegmentWidthRef = useRef(0)
  const categoryMeasureFrameRef = useRef<number | null>(null)
  const categoryLoopAdjustingRef = useRef(false)
  const categoryLoopAdjustFrameRef = useRef<number | null>(null)
  const [categoryLoopEnabled, setCategoryLoopEnabled] = useState(false)

  useEffect(() => {
    const measureTrack = () => {
      categoryMeasureFrameRef.current = null
      const viewport = categoryViewportRef.current
      const segment = categorySegmentRef.current
      if (!viewport || !segment || categoryChipItems.length === 0) {
        categorySegmentWidthRef.current = 0
        setCategoryLoopEnabled(false)
        return
      }

      const segmentWidth = Math.ceil(segment.scrollWidth)
      categorySegmentWidthRef.current = segmentWidth
      const nextLoopEnabled =
        !isMobile &&
        taskView === 'gallery' &&
        categoryChipItems.length > 1 &&
        segmentWidth > viewport.clientWidth + 8

      setCategoryLoopEnabled((current) => (current === nextLoopEnabled ? current : nextLoopEnabled))
    }

    const queueMeasure = () => {
      if (categoryMeasureFrameRef.current != null) {
        window.cancelAnimationFrame(categoryMeasureFrameRef.current)
      }
      categoryMeasureFrameRef.current = window.requestAnimationFrame(measureTrack)
    }

    const rafId = window.requestAnimationFrame(measureTrack)
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(queueMeasure)

    if (resizeObserver) {
      if (categoryViewportRef.current) {
        resizeObserver.observe(categoryViewportRef.current)
      }
      if (categorySegmentRef.current) {
        resizeObserver.observe(categorySegmentRef.current)
      }
    }

    window.addEventListener('resize', queueMeasure)
    return () => {
      if (categoryMeasureFrameRef.current != null) {
        window.cancelAnimationFrame(categoryMeasureFrameRef.current)
        categoryMeasureFrameRef.current = null
      }
      window.cancelAnimationFrame(rafId)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', queueMeasure)
    }
  }, [categoryChipItems, categoryChipLayoutSignature, isMobile, taskView])

  useEffect(() => {
    const viewport = categoryViewportRef.current
    if (!viewport) return

    if (categoryLoopAdjustFrameRef.current != null) {
      window.cancelAnimationFrame(categoryLoopAdjustFrameRef.current)
      categoryLoopAdjustFrameRef.current = null
    }

    categoryLoopAdjustingRef.current = true
    if (!categoryLoopEnabled) {
      viewport.scrollLeft = 0
      categoryLoopAdjustFrameRef.current = window.requestAnimationFrame(() => {
        categoryLoopAdjustingRef.current = false
        categoryLoopAdjustFrameRef.current = null
      })

      return () => {
        if (categoryLoopAdjustFrameRef.current != null) {
          window.cancelAnimationFrame(categoryLoopAdjustFrameRef.current)
          categoryLoopAdjustFrameRef.current = null
        }
        categoryLoopAdjustingRef.current = false
      }
    }

    const segmentWidth = categorySegmentWidthRef.current
    if (!segmentWidth) {
      categoryLoopAdjustingRef.current = false
      return
    }

    viewport.scrollLeft = segmentWidth
    categoryLoopAdjustFrameRef.current = window.requestAnimationFrame(() => {
      categoryLoopAdjustingRef.current = false
      categoryLoopAdjustFrameRef.current = null
    })

    return () => {
      if (categoryLoopAdjustFrameRef.current != null) {
        window.cancelAnimationFrame(categoryLoopAdjustFrameRef.current)
        categoryLoopAdjustFrameRef.current = null
      }
      categoryLoopAdjustingRef.current = false
    }
  }, [categoryLoopEnabled, categoryChipLayoutSignature, taskView])

  useEffect(
    () => () => {
      if (categoryLoopAdjustFrameRef.current != null) {
        window.cancelAnimationFrame(categoryLoopAdjustFrameRef.current)
      }
      categoryLoopAdjustingRef.current = false
    },
    [],
  )

  useEffect(() => {
    const viewport = categoryViewportRef.current
    if (!viewport || isMobile || !categoryLoopEnabled) return

    const handleWheel = (event: WheelEvent) => {
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX

      if (!delta) return
      event.preventDefault()
      viewport.scrollLeft += delta
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [categoryLoopEnabled, isMobile])

  const handleCategoryTrackScroll: UIEventHandler<HTMLDivElement> = () => {
    if (!categoryLoopEnabled) return

    const viewport = categoryViewportRef.current
    if (!viewport || categoryLoopAdjustingRef.current) return

    const segmentWidth = categorySegmentWidthRef.current
    if (!segmentWidth) return

    let nextScrollLeft = viewport.scrollLeft
    if (viewport.scrollLeft < segmentWidth * CATEGORY_LOOP_MIN_SCROLL_RATIO) {
      nextScrollLeft = viewport.scrollLeft + segmentWidth
    } else if (viewport.scrollLeft > segmentWidth * CATEGORY_LOOP_MAX_SCROLL_RATIO) {
      nextScrollLeft = viewport.scrollLeft - segmentWidth
    }

    if (nextScrollLeft === viewport.scrollLeft) return

    categoryLoopAdjustingRef.current = true
    viewport.scrollLeft = nextScrollLeft
    if (categoryLoopAdjustFrameRef.current != null) {
      window.cancelAnimationFrame(categoryLoopAdjustFrameRef.current)
    }

    categoryLoopAdjustFrameRef.current = window.requestAnimationFrame(() => {
      categoryLoopAdjustingRef.current = false
      categoryLoopAdjustFrameRef.current = null
    })
  }

  return {
    categoryViewportRef,
    categorySegmentRef,
    categoryLoopEnabled,
    handleCategoryTrackScroll,
  }
}
