import type { TaskKind } from '@/types'

interface TaskCardMetaChipsProps {
  isInRecycleBin: boolean
  isFavorite: boolean
  taskKind: TaskKind
  categoryName: string
  providerName: string
  statusLabel: string
  statusChipClass: string
  progressCountLabel: string | null
  transportLabel: string | null
  transportChipClass: string
  displayQuality: string
  qualityTitle?: string
  sizeChipValue: string
  sizeTitle?: string
  displayOutputFormat: string
  outputFormatTitle?: string
}

export default function TaskCardMetaChips({
  isInRecycleBin,
  isFavorite,
  taskKind,
  categoryName,
  providerName,
  statusLabel,
  statusChipClass,
  progressCountLabel,
  transportLabel,
  transportChipClass,
  displayQuality,
  qualityTitle,
  sizeChipValue,
  sizeTitle,
  displayOutputFormat,
  outputFormatTitle,
}: TaskCardMetaChipsProps) {
  return (
    <div className="mask-edge-r hide-scrollbar flex min-w-0 gap-1 overflow-x-auto whitespace-nowrap pr-2">
      {isInRecycleBin && (
        <span className="flex-shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
          回收站
        </span>
      )}

      {!isInRecycleBin && isFavorite && (
        <span className="flex-shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
          收藏
        </span>
      )}

      <span
        className="max-w-[8rem] flex-shrink-0 truncate rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
        title={categoryName}
      >
        {categoryName}
      </span>

      <span
        className="max-w-[9rem] flex-shrink-0 truncate rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"
        title={providerName}
      >
        {providerName}
      </span>

      <span className={`flex-shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${statusChipClass}`}>
        {statusLabel}
      </span>

      {taskKind === 'image' && (
        <span className="flex-shrink-0 rounded-full bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
          单图任务
        </span>
      )}

      {progressCountLabel && (
        <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
          {progressCountLabel}
        </span>
      )}

      {taskKind !== 'image' && transportLabel && (
        <span className={`flex-shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${transportChipClass}`}>
          {transportLabel}
        </span>
      )}

      {taskKind !== 'image' && (
        <>
          <span
            className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500 dark:bg-white/[0.04] dark:text-gray-400"
            title={qualityTitle}
          >
            {displayQuality}
          </span>

          <span
            className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500 dark:bg-white/[0.04] dark:text-gray-400"
            title={sizeTitle}
          >
            {sizeChipValue}
          </span>

          <span
            className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500 dark:bg-white/[0.04] dark:text-gray-400"
            title={outputFormatTitle}
          >
            {displayOutputFormat}
          </span>
        </>
      )}
    </div>
  )
}
