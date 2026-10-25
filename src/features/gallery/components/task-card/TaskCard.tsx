import { memo } from 'react'
import {
  canEditTaskOutputs,
  resolveTaskAppliedImageParam,
  resolveTaskDisplayImageParam,
  resolveTaskImageProgress,
  resolveTaskKind,
  resolveTaskTransportLabel,
  resolveTaskTransportMeta,
  resolveTaskRunOutcome,
  resolveTaskStatusLabel,
} from '@/store'
import TaskCardActions from './TaskCardActions'
import TaskCardMetaChips from './TaskCardMetaChips'
import TaskCardPreview from './TaskCardPreview'
import type { TaskCardProps } from './shared'
import { useTaskCardState } from './useTaskCardState'

function TaskCard({
  task,
  categoryName,
  providerName,
  isInRecycleBin,
  isFavorite,
  selected,
  onReuse,
  onEditOutputs,
  onRetry,
  onAbort,
  onShare,
  onToggleFavorite,
  onMoveCategory,
  onDelete,
  onPurge,
  onRestore,
  onClick,
  onToggleSelect,
  onContextMenu,
}: TaskCardProps) {
  const progress = resolveTaskImageProgress(task)
  const statusLabel = resolveTaskStatusLabel(task)
  const transportLabel = resolveTaskTransportLabel(task)
  const transportMeta = resolveTaskTransportMeta(task)
  const canEditOutputs = canEditTaskOutputs(task)
  const taskKind = resolveTaskKind(task)
  const runOutcome = resolveTaskRunOutcome(task)
  const {
    cardRef,
    thumbSrc,
    coverRatio,
    coverSize,
    duration,
    touchActionsVisible,
    closeTouchActions,
    consumeCardClick,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useTaskCardState(task)

  const displayQuality = resolveTaskDisplayImageParam(task, 'quality')
  const displayOutputFormat = resolveTaskDisplayImageParam(task, 'output_format')
  const appliedQuality = resolveTaskAppliedImageParam(task, 'quality')
  const appliedSize = resolveTaskAppliedImageParam(task, 'size')
  const appliedOutputFormat = resolveTaskAppliedImageParam(task, 'output_format')
  const sizeChipValue = coverSize || task.params.size
  const sizeTitleParts: string[] = []

  if (coverSize) {
    sizeTitleParts.push(`输出像素: ${coverSize}`)
  }
  if (task.params.size !== sizeChipValue || !coverSize) {
    sizeTitleParts.push(`请求: ${task.params.size}`)
  }
  if (appliedSize && appliedSize !== sizeChipValue && appliedSize !== task.params.size) {
    sizeTitleParts.push(`API 返回: ${appliedSize}`)
  }

  const sizeTitle = sizeTitleParts.length > 0 ? sizeTitleParts.join(' / ') : undefined
  const qualityTitle =
    appliedQuality && appliedQuality !== task.params.quality
      ? `请求: ${task.params.quality} / 实际: ${displayQuality}`
      : undefined
  const outputFormatTitle =
    appliedOutputFormat && appliedOutputFormat !== task.params.output_format
      ? `请求: ${task.params.output_format} / 实际: ${displayOutputFormat}`
      : undefined
  const normalizedPrompt = task.prompt.trim()

  const statusChipClass =
    runOutcome === 'done'
      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
      : runOutcome === 'partial_error'
        ? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300'
      : runOutcome === 'error' || runOutcome === 'aborted'
        ? runOutcome === 'aborted'
          ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
          : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
        : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'
  const transportChipClass =
    transportMeta?.actual === 'stream'
      ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300'
      : transportMeta?.fallbackFromStream
        ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
        : 'bg-gray-100 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400'

  return (
    <div
      ref={cardRef}
      data-task-card-root
      data-task-id={task.id}
      className={`group/task-card cursor-pointer overflow-hidden rounded-2xl border bg-white/[0.92] shadow-[0_16px_40px_-34px_rgba(15,23,42,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-34px_rgba(37,99,235,0.35)] dark:bg-gray-900/[0.92] ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-100 shadow-[0_18px_44px_-32px_rgba(37,99,235,0.45)] dark:ring-blue-500/20'
          : task.status === 'running'
            ? 'border-blue-400 generating'
            : 'border-gray-200/90 dark:border-white/[0.08]'
      }`}
      onClick={() => {
        if (!consumeCardClick()) return
        onClick()
      }}
      onContextMenu={onContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div className="flex h-40">
        <TaskCardPreview
          task={task}
          thumbSrc={thumbSrc}
          imageFit="cover"
          coverRatio={coverRatio}
          coverSize={coverSize}
          duration={duration}
          progressCountLabel={progress.countLabel}
          statusLabel={statusLabel}
          isInRecycleBin={isInRecycleBin}
          isFavorite={isFavorite}
          selected={selected}
          touchActionsVisible={touchActionsVisible}
          onAbort={onAbort}
          onToggleFavorite={onToggleFavorite}
          onToggleSelect={onToggleSelect}
          onHideTouchActions={closeTouchActions}
        />

        <div className="flex min-w-0 flex-1 flex-col p-3.5">
          <div className="mb-2 min-h-0 flex-1">
            <p className="line-clamp-3 text-[14px] font-medium leading-6 text-gray-700 dark:text-gray-200">
              {normalizedPrompt || (taskKind === 'image' ? '' : '(无提示词)')}
            </p>
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <TaskCardMetaChips
              isInRecycleBin={isInRecycleBin}
              isFavorite={isFavorite}
              taskKind={taskKind}
              categoryName={categoryName}
              providerName={providerName}
              statusLabel={statusLabel}
              statusChipClass={statusChipClass}
              progressCountLabel={progress.countLabel}
              transportLabel={transportLabel}
              transportChipClass={transportChipClass}
              displayQuality={displayQuality}
              qualityTitle={qualityTitle}
              sizeChipValue={sizeChipValue}
              sizeTitle={sizeTitle}
              displayOutputFormat={displayOutputFormat}
              outputFormatTitle={outputFormatTitle}
            />

            <TaskCardActions
              isInRecycleBin={isInRecycleBin}
              task={task}
              canEditOutputs={canEditOutputs}
              onReuse={onReuse}
              onEditOutputs={onEditOutputs}
              onRetry={onRetry}
              onShare={onShare}
              onMoveCategory={onMoveCategory}
              onDelete={onDelete}
              onPurge={onPurge}
              onRestore={onRestore}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(TaskCard, (prevProps, nextProps) => {
  return (
    prevProps.task === nextProps.task &&
    prevProps.categoryName === nextProps.categoryName &&
    prevProps.providerName === nextProps.providerName &&
    prevProps.isInRecycleBin === nextProps.isInRecycleBin &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.selected === nextProps.selected
  )
})
