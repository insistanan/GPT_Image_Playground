import { useMemo, type RefObject } from 'react'
import type {
  ImageMosaicDecorativeItem,
  ImageMosaicTaskItem,
} from './useImageMosaicLayout'

import { useGridViewport } from './useGridViewport'

const IMAGE_MOSAIC_OVERSCAN_ROWS = 36

interface UseVirtualImageMosaicOptions {
  wrapperRef: RefObject<HTMLDivElement | null>
  gridRef: RefObject<HTMLDivElement | null>
  rowUnit: number
  gap: number
  totalRowCount: number
  taskItems: ImageMosaicTaskItem[]
  decorativeItems: ImageMosaicDecorativeItem[]
  layoutVersion: number
}

function intersectsRowRange(
  rowStart: number,
  rowSpan: number,
  visibleStartRow: number,
  visibleEndRow: number,
) {
  const itemStart = rowStart
  const itemEnd = rowStart + rowSpan - 1
  return itemStart <= visibleEndRow && itemEnd >= visibleStartRow
}

export function useVirtualImageMosaic({
  wrapperRef,
  gridRef,
  rowUnit,
  gap,
  totalRowCount,
  taskItems,
  decorativeItems,
  layoutVersion,
}: UseVirtualImageMosaicOptions) {
  const metrics = useGridViewport(wrapperRef, gridRef, layoutVersion, totalRowCount)

  return useMemo(() => {
    const rowStride = rowUnit + gap
    const relativeViewportTop = Math.max(0, metrics.scrollTop - metrics.gridTop)
    const relativeViewportBottom = Math.max(
      0,
      metrics.scrollTop + metrics.viewportHeight - metrics.gridTop,
    )
    const viewportStartRow = Math.floor(relativeViewportTop / Math.max(rowStride, 1)) + 1
    const viewportEndRow = Math.ceil(relativeViewportBottom / Math.max(rowStride, 1)) + 1
    const visibleStartRow = Math.max(1, viewportStartRow - IMAGE_MOSAIC_OVERSCAN_ROWS)
    const visibleEndRow = Math.min(
      Math.max(totalRowCount, 1),
      viewportEndRow + IMAGE_MOSAIC_OVERSCAN_ROWS,
    )

    return {
      visibleStartRow,
      visibleEndRow,
      renderedTaskItems: taskItems.filter((item) =>
        intersectsRowRange(item.rowStart, item.rowSpan, visibleStartRow, visibleEndRow),
      ),
      renderedDecorativeItems: decorativeItems.filter((item) =>
        intersectsRowRange(item.rowStart, item.rowSpan, visibleStartRow, visibleEndRow),
      ),
    }
  }, [decorativeItems, gap, metrics, rowUnit, taskItems, totalRowCount])
}
