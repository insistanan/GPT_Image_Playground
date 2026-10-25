import { Fragment } from 'react'
import type { TaskKind } from '@/types'

interface TaskCardMetaChipsProps {
  isInRecycleBin: boolean
  isFavorite: boolean
  taskKind: TaskKind
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

const PILL_CLASS = 'flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4'
const NEUTRAL_PILL_CLASS = `${PILL_CLASS} bg-gray-100 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400`
const AMBER_PILL_CLASS = `${PILL_CLASS} bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300`

function Separator() {
  return (
    <span aria-hidden className="flex-shrink-0 text-gray-300 dark:text-gray-600">
      ·
    </span>
  )
}

export default function TaskCardMetaChips({
  isInRecycleBin,
  isFavorite,
  taskKind,
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
  const specItems = [
    { key: 'quality', text: displayQuality, title: qualityTitle },
    { key: 'size', text: sizeChipValue, title: sizeTitle },
    { key: 'format', text: displayOutputFormat, title: outputFormatTitle },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
        {isInRecycleBin && <span className={AMBER_PILL_CLASS}>回收站</span>}

        {!isInRecycleBin && isFavorite && <span className={AMBER_PILL_CLASS}>收藏</span>}

        <span className={`${PILL_CLASS} ${statusChipClass}`}>{statusLabel}</span>

        {progressCountLabel && <span className={NEUTRAL_PILL_CLASS}>{progressCountLabel}</span>}

        {taskKind !== 'image' && transportLabel && (
          <span className={`${PILL_CLASS} ${transportChipClass}`}>{transportLabel}</span>
        )}

        {taskKind === 'image' && <span className={NEUTRAL_PILL_CLASS}>单图任务</span>}
      </div>

      <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] leading-4 text-gray-500 dark:text-gray-400">
        <span className="min-w-0 flex-1 truncate" title={providerName}>
          {providerName}
        </span>

        {taskKind !== 'image' &&
          specItems.map((item) => (
            <Fragment key={item.key}>
              <Separator />
              <span className="flex-shrink-0 tabular-nums" title={item.title}>
                {item.text}
              </span>
            </Fragment>
          ))}
      </div>
    </div>
  )
}
