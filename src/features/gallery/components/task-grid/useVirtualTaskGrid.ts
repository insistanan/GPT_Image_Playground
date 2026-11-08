import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import { useGridViewport } from './useGridViewport'
import type { TaskRecord } from '@/types'
import { TASK_CARD_HEIGHT, TASK_GRID_GAP, TASK_GRID_OVERSCAN_ROWS } from './shared'

interface UseVirtualTaskGridOptions {
  wrapperRef: RefObject<HTMLDivElement | null>
  gridRef: RefObject<HTMLDivElement | null>
  tasks: TaskRecord[]
  layoutVersion: number
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
  const metrics = useGridViewport(wrapperRef, gridRef, layoutVersion, tasks.length)
  const [cardHeight, setCardHeight] = useState(TASK_CARD_HEIGHT)

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
