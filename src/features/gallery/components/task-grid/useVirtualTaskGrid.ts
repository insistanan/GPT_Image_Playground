import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import type { TaskRecord } from '@/types'
import { TASK_CARD_HEIGHT, TASK_GRID_GAP, TASK_GRID_OVERSCAN_ROWS } from './shared'

interface UseVirtualTaskGridOptions {
  wrapperRef: RefObject<HTMLDivElement | null>
  gridRef: RefObject<HTMLDivElement | null>
  tasks: TaskRecord[]
  layoutVersion: number
}

interface GridViewportMetrics {
  scrollTop: number
  viewportHeight: number
  viewportWidth: number
  gridTop: number
}

type ScrollContainer = Window | HTMLElement

function isWindowScrollContainer(container: ScrollContainer): container is Window {
  return container === window
}

function isScrollableOverflow(value: string): boolean {
  return /(auto|scroll|overlay)/.test(value)
}

function resolveScrollContainer(element: HTMLElement | null): ScrollContainer {
  let current = element?.parentElement ?? null

  while (current) {
    const style = window.getComputedStyle(current)
    if (isScrollableOverflow(style.overflowY) || isScrollableOverflow(style.overflow)) {
      return current
    }
    current = current.parentElement
  }

  return window
}

function readScrollTop(container: ScrollContainer): number {
  return isWindowScrollContainer(container) ? window.scrollY : container.scrollTop
}

function readViewportHeight(container: ScrollContainer): number {
  return isWindowScrollContainer(container) ? window.innerHeight : container.clientHeight
}

function readGridTop(grid: HTMLDivElement | null, container: ScrollContainer): number {
  const rect = grid?.getBoundingClientRect()
  if (!rect) {
    return 0
  }

  if (isWindowScrollContainer(container)) {
    return rect.top + window.scrollY
  }

  const containerRect = container.getBoundingClientRect()
  return rect.top - containerRect.top + container.scrollTop
}

function readGridViewportMetrics(
  grid: HTMLDivElement | null,
  container: ScrollContainer,
): GridViewportMetrics {
  return {
    scrollTop: readScrollTop(container),
    viewportHeight: readViewportHeight(container),
    viewportWidth: window.innerWidth,
    gridTop: readGridTop(grid, container),
  }
}

function resolveGridColumnCount(viewportWidth: number): number {
  if (viewportWidth >= 1024) {
    return 3
  }
  if (viewportWidth >= 640) {
    return 2
  }
  return 1
}

function getSpacerHeight(rowCount: number, rowHeight: number): number {
  if (rowCount <= 0) {
    return 0
  }

  return rowCount * rowHeight + Math.max(0, rowCount - 1) * TASK_GRID_GAP
}

export function useVirtualTaskGrid(options: UseVirtualTaskGridOptions) {
  const { wrapperRef, gridRef, tasks, layoutVersion } = options
  const [metrics, setMetrics] = useState<GridViewportMetrics>(() => readGridViewportMetrics(null, window))
  const [cardHeight, setCardHeight] = useState(TASK_CARD_HEIGHT)

  useLayoutEffect(() => {
    let frameId = 0
    const scrollContainer = resolveScrollContainer(wrapperRef.current)

    const updateMetrics = () => {
      frameId = 0
      setMetrics(readGridViewportMetrics(gridRef.current, scrollContainer))
    }

    const requestMetricsUpdate = () => {
      if (frameId !== 0) {
        return
      }

      frameId = window.requestAnimationFrame(updateMetrics)
    }

    updateMetrics()
    scrollContainer.addEventListener('scroll', requestMetricsUpdate, { passive: true })
    window.addEventListener('resize', requestMetricsUpdate)

    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            updateMetrics()
          })
        : null
    if (resizeObserver) {
      if (!isWindowScrollContainer(scrollContainer)) {
        resizeObserver.observe(scrollContainer)
      }
      if (wrapperRef.current) {
        resizeObserver.observe(wrapperRef.current)
      }
      if (gridRef.current) {
        resizeObserver.observe(gridRef.current)
      }
    }

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId)
      }
      scrollContainer.removeEventListener('scroll', requestMetricsUpdate)
      window.removeEventListener('resize', requestMetricsUpdate)
      resizeObserver?.disconnect()
    }
  }, [gridRef, layoutVersion, tasks.length, wrapperRef])

  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) {
      return
    }

    const card = grid.querySelector<HTMLElement>('[data-task-card-root]')
    if (!card) {
      return
    }

    const updateCardHeight = () => {
      const nextHeight = Math.round(card.getBoundingClientRect().height)
      if (nextHeight > 0 && nextHeight !== cardHeight) {
        setCardHeight(nextHeight)
      }
    }

    updateCardHeight()

    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            updateCardHeight()
          })
        : null
    resizeObserver?.observe(card)

    return () => {
      resizeObserver?.disconnect()
    }
  }, [cardHeight, gridRef, tasks.length])

  const virtualState = useMemo(() => {
    const columnCount = resolveGridColumnCount(metrics.viewportWidth)
    const totalCount = tasks.length
    const totalRowCount = Math.ceil(totalCount / columnCount)
    const rowStride = cardHeight + TASK_GRID_GAP
    const relativeViewportTop = Math.max(0, metrics.scrollTop - metrics.gridTop)
    const relativeViewportBottom = Math.max(0, metrics.scrollTop + metrics.viewportHeight - metrics.gridTop)
    const minimumRenderedRows = Math.max(1, TASK_GRID_OVERSCAN_ROWS * 2)

    const visibleStartRow = Math.floor(relativeViewportTop / Math.max(rowStride, 1))
    const visibleEndRow = Math.ceil(relativeViewportBottom / Math.max(rowStride, 1))
    const maxStartRow = Math.max(0, totalRowCount - minimumRenderedRows)
    const startRow = Math.min(
      Math.max(0, visibleStartRow - TASK_GRID_OVERSCAN_ROWS),
      maxStartRow,
    )
    const endRow = Math.min(
      totalRowCount,
      Math.max(startRow + minimumRenderedRows, visibleEndRow + TASK_GRID_OVERSCAN_ROWS),
    )

    const startIndex = Math.min(totalCount, startRow * columnCount)
    const endIndex = Math.min(totalCount, endRow * columnCount)
    const renderedTasks = tasks.slice(startIndex, endIndex)
    const topSpacerHeight = startRow > 0 ? getSpacerHeight(startRow, cardHeight) : 0
    const bottomRowCount = Math.max(0, totalRowCount - endRow)
    const bottomSpacerHeight = bottomRowCount > 0 ? getSpacerHeight(bottomRowCount, cardHeight) : 0

    return {
      renderedTasks,
      startIndex,
      endIndex,
      topSpacerHeight,
      bottomSpacerHeight,
    }
  }, [cardHeight, metrics, tasks])

  return virtualState
}
