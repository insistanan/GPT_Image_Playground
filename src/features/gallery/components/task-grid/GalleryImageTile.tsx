import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  resolveTaskImageProgress,
  resolveTaskStatusLabel,
} from '@/store'
import type { TaskRecord } from '@/types'
import TaskCardPreviewActionButtons from '@/features/gallery/components/task-card/TaskCardPreviewActionButtons'
import TaskCardPreviewStatusLayer from '@/features/gallery/components/task-card/TaskCardPreviewStatusLayer'
import { useTaskCardState } from '@/features/gallery/components/task-card/useTaskCardState'

interface GalleryImageTileProps {
  task: TaskRecord
  isInRecycleBin: boolean
  isFavorite: boolean
  selected: boolean
  accentIndex: number
  onClick: () => void
  onAbort: () => void
  onToggleFavorite: () => void
  onToggleSelect: () => void
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void
}

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const TILE_SHAPE_CLASSES = [
  'rounded-[28px_22px_30px_20px]',
  'rounded-[22px_30px_20px_32px]',
  'rounded-[30px_20px_28px_24px]',
  'rounded-[24px_32px_22px_28px]',
]

export default function GalleryImageTile({
  task,
  isInRecycleBin,
  isFavorite,
  selected,
  accentIndex,
  onClick,
  onAbort,
  onToggleFavorite,
  onToggleSelect,
  onContextMenu,
}: GalleryImageTileProps) {
  const progress = resolveTaskImageProgress(task)
  const statusLabel = resolveTaskStatusLabel(task)
  const {
    cardRef,
    thumbSrc,
    coverRatio,
    coverSize,
    duration,
    isPreferredImageReady,
    touchActionsVisible,
    closeTouchActions,
    consumeCardClick,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useTaskCardState(task, {
    preferredImageVariant: 'original',
    loadPreferredImageWhenVisible: true,
    preferredVisibleRootMargin: '280px 0px',
    loadThumbnailWhenVisible: true,
    thumbnailVisibleRootMargin: '1100px 0px',
  })

  const overlayVisibleClass =
    selected || touchActionsVisible || task.status !== 'done'
      ? 'translate-y-0 opacity-100'
      : 'pointer-events-none translate-y-1 opacity-0 group-hover/task-card:pointer-events-auto group-hover/task-card:translate-y-0 group-hover/task-card:opacity-100'
  const shapeClass = TILE_SHAPE_CLASSES[accentIndex] ?? TILE_SHAPE_CLASSES[0]
  const cornerMetaLabel = coverRatio || duration

  return (
    <div
      ref={cardRef}
      data-task-card-root
      data-task-id={task.id}
      className="group/task-card relative h-full cursor-pointer transition-transform duration-200 hover:-translate-y-0.5"
      onClick={() => {
        if (!consumeCardClick()) {
          return
        }
        onClick()
      }}
      onContextMenu={onContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        className={`relative h-full overflow-hidden border bg-white/[0.74] shadow-[0_24px_50px_-34px_rgba(15,23,42,0.72)] transition-all duration-200 dark:bg-gray-950/[0.72] ${
          selected
            ? 'border-blue-500 ring-2 ring-blue-100 dark:ring-blue-500/20'
            : task.status === 'running'
              ? 'border-blue-300/70'
              : 'border-white/70 dark:border-white/[0.08]'
        } ${shapeClass}`}
      >
        <div className="group/task-preview relative h-full w-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.96),rgba(241,245,249,0.58))] p-2.5 dark:bg-[radial-gradient(circle_at_top,rgba(30,41,59,0.72),rgba(2,6,23,0.92))]">
          <div className="relative h-full w-full overflow-hidden rounded-[22px] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.82))] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.88))]">
          <TaskCardPreviewStatusLayer
            task={task}
            thumbSrc={thumbSrc}
            imageFit="contain"
            progressCountLabel={progress.countLabel}
            statusLabel={statusLabel}
            onAbort={onAbort}
          />

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/[0.28] via-transparent to-black/[0.06] opacity-0 transition-opacity duration-200 group-hover/task-card:opacity-100" />

          <TaskCardPreviewActionButtons
            isInRecycleBin={isInRecycleBin}
            isFavorite={isFavorite}
            selected={selected}
            touchActionsVisible={touchActionsVisible}
            onToggleFavorite={onToggleFavorite}
            onToggleSelect={onToggleSelect}
            onHideTouchActions={closeTouchActions}
          />

          <div
            className={`absolute left-2 top-2 z-10 flex flex-wrap items-center gap-1.5 transition-all duration-200 ${overlayVisibleClass}`}
          >
            <span className="rounded-full bg-black/[0.55] px-2 py-0.5 font-mono text-[11px] text-white backdrop-blur-sm">
              {cornerMetaLabel}
            </span>
            {coverRatio && coverSize && (
              <span className="rounded-full bg-black/[0.55] px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm">
                {coverSize}
              </span>
            )}
          </div>

          <div
            className={`absolute inset-x-0 bottom-0 z-[5] flex items-end justify-start p-3 transition-all duration-200 ${overlayVisibleClass}`}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-black/[0.52] px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
                {DATE_FORMATTER.format(task.createdAt)}
              </span>
              {isPreferredImageReady && task.status === 'done' && (
                <span className="rounded-full bg-white/[0.9] px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-blue-600 backdrop-blur-sm dark:bg-slate-900/82 dark:text-blue-300">
                  原图
                </span>
              )}
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
