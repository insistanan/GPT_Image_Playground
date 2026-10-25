import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject } from 'react'
import {
  ALL_CATEGORY_FILTER,
  type TaskRecord,
  type TaskView,
} from '@/types'
import GalleryImageTile from './GalleryImageTile'
import MosaicDecorativeTile from './MosaicDecorativeTile'
import { useImageMosaicLayout } from './useImageMosaicLayout'
import { useVirtualImageMosaic } from './useVirtualImageMosaic'

interface TaskGridImageModeProps {
  filteredTaskCount: number
  tasks: TaskRecord[]
  selectedCount: number
  selectedIdSet: Set<string>
  activeCategoryFilter: string
  activeCategoryLabel: string
  searchQuery: string
  taskView: TaskView
  wrapperRef: RefObject<HTMLDivElement | null>
  gridRef: RefObject<HTMLDivElement | null>
  onGridMouseDownCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  onTaskOpen: (taskId: string) => void
  onToggleTaskSelection: (taskId: string) => void
  onTaskAbort: (task: TaskRecord) => void
  onTaskToggleFavorite: (task: TaskRecord) => void
  onTaskContextMenu: (task: TaskRecord, event: ReactMouseEvent<HTMLDivElement>) => void
}

export default function TaskGridImageMode({
  filteredTaskCount,
  tasks,
  selectedCount,
  selectedIdSet,
  activeCategoryFilter,
  activeCategoryLabel,
  searchQuery,
  taskView,
  wrapperRef,
  gridRef,
  onGridMouseDownCapture,
  onTaskOpen,
  onToggleTaskSelection,
  onTaskAbort,
  onTaskToggleFavorite,
  onTaskContextMenu,
}: TaskGridImageModeProps) {
  const mosaicLayout = useImageMosaicLayout({
    gridRef,
    tasks,
  })
  const virtualMosaic = useVirtualImageMosaic({
    wrapperRef,
    gridRef,
    rowUnit: mosaicLayout.rowUnit,
    gap: mosaicLayout.gap,
    totalRowCount: mosaicLayout.totalRowCount,
    taskItems: mosaicLayout.items,
    decorativeItems: mosaicLayout.decorativeItems,
    layoutVersion: selectedCount + filteredTaskCount,
  })

  if (!filteredTaskCount) {
    return (
      <div className="py-20 text-center text-gray-400 dark:text-gray-500">
        {searchQuery ? (
          <p className="text-sm">没有找到匹配的记录</p>
        ) : taskView === 'trash' ? (
          <p className="text-sm">回收站为空</p>
        ) : activeCategoryFilter !== ALL_CATEGORY_FILTER ? (
          <p className="text-sm">分类「{activeCategoryLabel}」里还没有项目</p>
        ) : (
          <>
            <svg
              className="mx-auto mb-4 h-16 w-16 text-gray-200 dark:text-gray-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2 1.586-1.586a2 2 0 0 1 2.828 0L20 14m-6-6h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"
              />
            </svg>
            <p className="text-sm">输入提示词生成图片，或直接拖图、粘图到这里</p>
          </>
        )}
      </div>
    )
  }

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${mosaicLayout.columnCount}, minmax(0, 1fr))`,
    gridAutoRows: `${mosaicLayout.rowUnit}px`,
    gap: `${mosaicLayout.gap}px`,
  }

  return (
    <>
      <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>图片模式 · 真实比例拼贴 · {filteredTaskCount} 条</span>
        {selectedCount > 0 && <span>已选 {selectedCount} 条</span>}
      </div>

      <div
        ref={gridRef}
        onMouseDownCapture={onGridMouseDownCapture}
        className="relative grid overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(248,250,252,0.44))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.34),rgba(2,6,23,0.16))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        style={gridStyle}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.28),transparent_22%),radial-gradient(circle_at_78%_18%,rgba(253,224,71,0.12),transparent_18%),radial-gradient(circle_at_18%_76%,rgba(196,181,253,0.12),transparent_16%),linear-gradient(135deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0)_38%,rgba(219,234,254,0.10)_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_22%),radial-gradient(circle_at_78%_18%,rgba(250,204,21,0.05),transparent_18%),radial-gradient(circle_at_18%_76%,rgba(168,85,247,0.06),transparent_16%)]"
        />

        {virtualMosaic.renderedTaskItems.map((item) => (
          <div
            key={item.task.id}
            style={{
              gridColumn: `${item.columnStart} / span ${item.columnSpan}`,
              gridRow: `${item.rowStart} / span ${item.rowSpan}`,
            }}
            className="relative z-10"
          >
            <GalleryImageTile
              task={item.task}
              isInRecycleBin={false}
              isFavorite={Boolean(item.task.isFavorite)}
              selected={selectedIdSet.has(item.task.id)}
              accentIndex={item.accentIndex}
              onClick={() => onTaskOpen(item.task.id)}
              onAbort={() => onTaskAbort(item.task)}
              onToggleFavorite={() => onTaskToggleFavorite(item.task)}
              onToggleSelect={() => onToggleTaskSelection(item.task.id)}
              onContextMenu={(event) => onTaskContextMenu(item.task, event)}
            />
          </div>
        ))}

        {virtualMosaic.renderedDecorativeItems.map((item) => (
          <div
            key={item.id}
            aria-hidden
            style={{
              gridColumn: `${item.columnStart} / span ${item.columnSpan}`,
              gridRow: `${item.rowStart} / span ${item.rowSpan}`,
            }}
            className="relative z-0"
          >
            <MosaicDecorativeTile
              variant={item.variant}
              accentIndex={item.accentIndex}
              rotation={item.rotation}
              styleKind={item.styleKind}
            />
          </div>
        ))}

        <div
          aria-hidden
          className="pointer-events-none col-span-full h-0 w-0"
          style={{
            gridColumn: `1 / span ${mosaicLayout.columnCount}`,
            gridRow: `${mosaicLayout.totalRowCount} / span 1`,
          }}
        />
      </div>
    </>
  )
}
