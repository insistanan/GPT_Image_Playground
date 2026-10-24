import type { TaskRecord } from '../../../../types'
import TaskCardPreviewActionButtons from './TaskCardPreviewActionButtons'
import TaskCardPreviewStatusLayer from './TaskCardPreviewStatusLayer'

interface TaskCardPreviewProps {
  task: TaskRecord
  thumbSrc: string
  imageFit?: 'cover' | 'contain'
  coverRatio: string
  coverSize: string
  duration: string
  progressCountLabel: string | null
  statusLabel: string
  isInRecycleBin: boolean
  isFavorite: boolean
  selected: boolean
  touchActionsVisible: boolean
  onAbort: () => void
  onToggleFavorite: () => void
  onToggleSelect: () => void
  onHideTouchActions: () => void
}

function TaskCardPreviewMetaBadge({
  task,
  coverRatio,
  coverSize,
  duration,
}: {
  task: TaskRecord
  coverRatio: string
  coverSize: string
  duration: string
}) {
  if (task.status !== 'done' || !coverRatio || !coverSize) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-black/[0.55] px-2 py-0.5 font-mono text-[11px] text-white backdrop-blur-sm">
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {duration}
      </span>
    )
  }

  return (
    <>
      <span className="rounded-full bg-black/[0.55] px-2 py-0.5 font-mono text-[11px] text-white backdrop-blur-sm">
        {coverRatio}
      </span>
      <span className="rounded-full bg-black/[0.55] px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm">
        {coverSize}
      </span>
    </>
  )
}

export default function TaskCardPreview({
  task,
  thumbSrc,
  imageFit = 'cover',
  coverRatio,
  coverSize,
  duration,
  progressCountLabel,
  statusLabel,
  isInRecycleBin,
  isFavorite,
  selected,
  touchActionsVisible,
  onAbort,
  onToggleFavorite,
  onToggleSelect,
  onHideTouchActions,
}: TaskCardPreviewProps) {
  const isRunning = task.status === 'running'

  return (
    <div
      className={`group/task-preview relative flex h-40 w-40 min-w-[10rem] flex-shrink-0 items-center justify-center overflow-hidden bg-gray-100 dark:bg-black/20 ${isRunning ? 'select-none' : ''}`}
    >
      <TaskCardPreviewActionButtons
        isInRecycleBin={isInRecycleBin}
        isFavorite={isFavorite}
        selected={selected}
        touchActionsVisible={touchActionsVisible}
        onToggleFavorite={onToggleFavorite}
        onToggleSelect={onToggleSelect}
        onHideTouchActions={onHideTouchActions}
      />

      <TaskCardPreviewStatusLayer
        task={task}
        thumbSrc={thumbSrc}
        imageFit={imageFit}
        progressCountLabel={progressCountLabel}
        statusLabel={statusLabel}
        onAbort={onAbort}
      />

      <div className="absolute left-2 top-2 flex items-center gap-1.5">
        <TaskCardPreviewMetaBadge
          task={task}
          coverRatio={coverRatio}
          coverSize={coverSize}
          duration={duration}
        />
      </div>
    </div>
  )
}
