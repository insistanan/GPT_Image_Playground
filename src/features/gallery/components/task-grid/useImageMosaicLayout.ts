import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import type { TaskRecord } from '@/types'
import {
  resolveTaskMosaicDimensions,
  resolveTaskMosaicSeed,
} from './imageModeShared'

const IMAGE_MOSAIC_GAP = 14
const IMAGE_MOSAIC_ROW_UNIT = 8

export type MosaicDecorativeVariant =
  | 'ai-orbit'
  | 'brush-note'
  | 'cute-sticker'
  | 'draft-frame'
  | 'magic-spark'

export interface ImageMosaicTaskItem {
  task: TaskRecord
  columnStart: number
  rowStart: number
  columnSpan: number
  rowSpan: number
  accentIndex: number
}

export interface ImageMosaicDecorativeItem {
  id: string
  columnStart: number
  rowStart: number
  columnSpan: number
  rowSpan: number
  accentIndex: number
  rotation: number
  variant: MosaicDecorativeVariant
  styleKind: 'panel' | 'micro'
}

interface UseImageMosaicLayoutOptions {
  gridRef: RefObject<HTMLDivElement | null>
  tasks: TaskRecord[]
}

interface MosaicPlacementCandidate {
  columnSpan: number
  rowSpan: number
}

interface MosaicPlacementResult extends MosaicPlacementCandidate {
  columnStart: number
  rowStart: number
}

interface EmptyRectangle {
  row: number
  column: number
  width: number
  height: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getCandidateSeed(seed: number, index: number) {
  return (seed + index * 17) >>> 0
}

function resolveImageMosaicColumnCount(width: number): number {
  if (width >= 1700) {
    return 9
  }
  if (width >= 1480) {
    return 8
  }
  if (width >= 1240) {
    return 7
  }
  if (width >= 980) {
    return 6
  }
  if (width >= 760) {
    return 5
  }
  if (width >= 560) {
    return 4
  }
  if (width >= 420) {
    return 3
  }
  return 2
}

function resolvePreferredColumnSpan(aspectRatio: number, columnCount: number) {
  if (columnCount <= 2) {
    return aspectRatio >= 1.18 ? 2 : 1
  }

  if (columnCount === 3) {
    return aspectRatio >= 1.55 ? 2 : 1
  }

  if (aspectRatio >= 2.2) {
    return Math.min(columnCount, 4)
  }
  if (aspectRatio >= 1.55) {
    return Math.min(columnCount, 3)
  }
  if (aspectRatio >= 1.08) {
    return Math.min(columnCount, 3)
  }
  if (aspectRatio >= 0.78) {
    return 2
  }
  if (aspectRatio >= 0.56) {
    return columnCount >= 6 ? 2 : 1
  }

  return 1
}

function buildPlacementCandidates(
  aspectRatio: number,
  columnCount: number,
  columnWidth: number,
): MosaicPlacementCandidate[] {
  const preferredColumnSpan = resolvePreferredColumnSpan(aspectRatio, columnCount)
  const columnSpanSet = new Set<number>([
    preferredColumnSpan,
    preferredColumnSpan - 1,
    preferredColumnSpan + 1,
    aspectRatio >= 1.4 ? preferredColumnSpan + 2 : preferredColumnSpan - 2,
  ])

  const candidates = Array.from(columnSpanSet)
    .map((columnSpan) => clamp(columnSpan, 1, columnCount))
    .filter((columnSpan, index, list) => list.indexOf(columnSpan) === index)
    .map((columnSpan) => {
      const tileWidth =
        columnWidth * columnSpan + IMAGE_MOSAIC_GAP * Math.max(0, columnSpan - 1)
      const tileHeight = Math.round(tileWidth / aspectRatio)
      const rowSpan = Math.max(
        14,
        Math.round((tileHeight + IMAGE_MOSAIC_GAP) / (IMAGE_MOSAIC_ROW_UNIT + IMAGE_MOSAIC_GAP)),
      )

      return {
        columnSpan,
        rowSpan,
      }
    })

  return candidates.sort((left, right) => left.columnSpan - right.columnSpan)
}

function pickPlacement(
  heights: number[],
  candidates: MosaicPlacementCandidate[],
  preferredColumnSpan: number,
  seed: number,
): MosaicPlacementResult {
  let bestPlacement: (MosaicPlacementResult & { score: number }) | null = null

  for (const candidate of candidates) {
    const maxColumnStart = heights.length - candidate.columnSpan
    for (let columnStart = 0; columnStart <= maxColumnStart; columnStart += 1) {
      const occupiedSlice = heights.slice(columnStart, columnStart + candidate.columnSpan)
      const rowStart = Math.max(...occupiedSlice)
      const reliefPenalty = occupiedSlice.reduce((total, height) => total + (rowStart - height), 0)
      const leftEdgePenalty = Math.abs((heights[columnStart - 1] ?? rowStart) - rowStart)
      const rightEdgePenalty = Math.abs(
        (heights[columnStart + candidate.columnSpan] ?? rowStart) - rowStart,
      )
      const targetColumn = getCandidateSeed(seed, candidate.columnSpan) %
        (maxColumnStart + 1)
      const driftPenalty = Math.abs(columnStart - targetColumn)
      const spanPenalty = Math.abs(candidate.columnSpan - preferredColumnSpan)
      const score =
        rowStart * 420 +
        reliefPenalty * 20 +
        (leftEdgePenalty + rightEdgePenalty) * 8 +
        spanPenalty * 12 +
        driftPenalty * 0.35

      if (!bestPlacement || score < bestPlacement.score) {
        bestPlacement = {
          columnStart,
          rowStart,
          columnSpan: candidate.columnSpan,
          rowSpan: candidate.rowSpan,
          score,
        }
      }
    }
  }

  if (bestPlacement) {
    return {
      columnStart: bestPlacement.columnStart,
      rowStart: bestPlacement.rowStart,
      columnSpan: bestPlacement.columnSpan,
      rowSpan: bestPlacement.rowSpan,
    }
  }

  return {
    columnStart: 0,
    rowStart: Math.max(...heights, 0),
    columnSpan: 1,
    rowSpan: 14,
  }
}

function buildOccupancyMatrix(items: ImageMosaicTaskItem[], columnCount: number, rowCount: number) {
  const matrix = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => false))

  for (const item of items) {
    for (let row = item.rowStart - 1; row < item.rowStart - 1 + item.rowSpan; row += 1) {
      for (
        let column = item.columnStart - 1;
        column < item.columnStart - 1 + item.columnSpan;
        column += 1
      ) {
        matrix[row][column] = true
      }
    }
  }

  return matrix
}

function collectEmptyRectangles(matrix: boolean[][]): EmptyRectangle[] {
  const rowCount = matrix.length
  const columnCount = matrix[0]?.length ?? 0
  const reserved = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => false))
  const rectangles: EmptyRectangle[] = []

  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      if (reserved[row][column] || matrix[row][column]) {
        continue
      }

      let maxWidth = 0
      while (
        column + maxWidth < columnCount &&
        !matrix[row][column + maxWidth] &&
        !reserved[row][column + maxWidth]
      ) {
        maxWidth += 1
      }

      let bestRectangle: EmptyRectangle | null = null
      let currentWidth = maxWidth

      for (let height = 1; row + height <= rowCount && currentWidth > 0; height += 1) {
        const nextRow = row + height - 1
        let rowWidth = 0
        while (
          rowWidth < currentWidth &&
          column + rowWidth < columnCount &&
          !matrix[nextRow][column + rowWidth] &&
          !reserved[nextRow][column + rowWidth]
        ) {
          rowWidth += 1
        }

        currentWidth = Math.min(currentWidth, rowWidth)
        if (currentWidth <= 0) {
          break
        }

        const area = currentWidth * height
        const score = area - Math.abs(currentWidth - height) * 0.15
        const bestArea = bestRectangle ? bestRectangle.width * bestRectangle.height : 0
        const bestScore =
          bestRectangle ? bestArea - Math.abs(bestRectangle.width - bestRectangle.height) * 0.15 : -1

        if (score >= bestScore) {
          bestRectangle = {
            row,
            column,
            width: currentWidth,
            height,
          }
        }
      }

      if (!bestRectangle) {
        continue
      }

      for (let reservedRow = bestRectangle.row; reservedRow < bestRectangle.row + bestRectangle.height; reservedRow += 1) {
        for (
          let reservedColumn = bestRectangle.column;
          reservedColumn < bestRectangle.column + bestRectangle.width;
          reservedColumn += 1
        ) {
          reserved[reservedRow][reservedColumn] = true
        }
      }

      rectangles.push(bestRectangle)
    }
  }

  return rectangles
}

function resolveDecorativeVariant(seed: number): MosaicDecorativeVariant {
  const variants: MosaicDecorativeVariant[] = [
    'ai-orbit',
    'brush-note',
    'cute-sticker',
    'draft-frame',
    'magic-spark',
  ]

  return variants[seed % variants.length] ?? 'ai-orbit'
}

function buildDecorativeItems(
  items: ImageMosaicTaskItem[],
  columnCount: number,
): ImageMosaicDecorativeItem[] {
  const maxRow = items.reduce((currentMax, item) => Math.max(currentMax, item.rowStart - 1 + item.rowSpan), 0)
  if (maxRow <= 0) {
    return []
  }

  const occupancyMatrix = buildOccupancyMatrix(items, columnCount, maxRow)
  const emptyRectangles = collectEmptyRectangles(occupancyMatrix).sort((left, right) => {
    const leftArea = left.width * left.height
    const rightArea = right.width * right.height
    return rightArea - leftArea
  })
  const maxDecorativeCount = Math.min(18, Math.max(4, Math.floor(items.length / 3)))
  const decorativeItems: ImageMosaicDecorativeItem[] = []

  for (const rectangle of emptyRectangles) {
    const width = rectangle.width
    const height = rectangle.height
    const area = width * height

    if (decorativeItems.length >= maxDecorativeCount) {
      break
    }

    if (area < 4 || (width === 1 && height === 1)) {
      continue
    }

    if (rectangle.row + height >= maxRow - 1 && area < 10) {
      continue
    }

    const seed =
      (rectangle.row + 1) * 37 +
      (rectangle.column + 1) * 53 +
      width * 97 +
      height * 131

    decorativeItems.push({
      id: `decor-${rectangle.row}-${rectangle.column}-${seed}`,
      columnStart: rectangle.column + 1,
      rowStart: rectangle.row + 1,
      columnSpan: width,
      rowSpan: height,
      accentIndex: seed % 4,
      rotation: (seed % 9) - 4,
      variant: resolveDecorativeVariant(seed),
      styleKind: area >= 12 || (width >= 2 && height >= 3) ? 'panel' : 'micro',
    })
  }

  return decorativeItems
}

export function useImageMosaicLayout({ gridRef, tasks }: UseImageMosaicLayoutOptions) {
  const [gridWidth, setGridWidth] = useState(0)

  useLayoutEffect(() => {
    const gridElement = gridRef.current
    if (!gridElement) {
      return
    }

    const updateGridWidth = () => {
      const nextWidth = Math.round(gridElement.getBoundingClientRect().width)
      if (nextWidth > 0) {
        setGridWidth(nextWidth)
      }
    }

    updateGridWidth()

    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            updateGridWidth()
          })
        : null

    resizeObserver?.observe(gridElement)
    window.addEventListener('resize', updateGridWidth)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateGridWidth)
    }
  }, [gridRef])

  return useMemo(() => {
    const resolvedGridWidth = gridWidth > 0 ? gridWidth : window.innerWidth
    const columnCount = resolveImageMosaicColumnCount(resolvedGridWidth)
    const columnWidth =
      (resolvedGridWidth - IMAGE_MOSAIC_GAP * Math.max(0, columnCount - 1)) / columnCount
    const heights = Array.from({ length: columnCount }, () => 0)

    const items: ImageMosaicTaskItem[] = tasks.map((task, index) => {
      const { width, height } = resolveTaskMosaicDimensions(task)
      const aspectRatio = clamp(width / height, 0.48, 3)
      const seed = resolveTaskMosaicSeed(task, index)
      const preferredColumnSpan = resolvePreferredColumnSpan(aspectRatio, columnCount)
      const candidates = buildPlacementCandidates(aspectRatio, columnCount, columnWidth)
      const placement = pickPlacement(heights, candidates, preferredColumnSpan, seed)

      for (
        let column = placement.columnStart;
        column < placement.columnStart + placement.columnSpan;
        column += 1
      ) {
        heights[column] = placement.rowStart + placement.rowSpan
      }

      return {
        task,
        columnStart: placement.columnStart + 1,
        rowStart: placement.rowStart + 1,
        columnSpan: placement.columnSpan,
        rowSpan: placement.rowSpan,
        accentIndex: seed % 4,
      }
    })

    const decorativeItems = buildDecorativeItems(items, columnCount)
    const totalRowCount = Math.max(
      1,
      ...items.map((item) => item.rowStart + item.rowSpan - 1),
      ...decorativeItems.map((item) => item.rowStart + item.rowSpan - 1),
    )

    return {
      columnCount,
      rowUnit: IMAGE_MOSAIC_ROW_UNIT,
      gap: IMAGE_MOSAIC_GAP,
      items,
      decorativeItems,
      totalRowCount,
    }
  }, [gridWidth, tasks])
}
