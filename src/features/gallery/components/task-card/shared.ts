import type { MouseEvent as ReactMouseEvent } from 'react'
import type { TaskRecord } from '@/types'

export interface TaskCardProps {
  task: TaskRecord
  categoryName: string
  providerName: string
  isInRecycleBin: boolean
  isFavorite: boolean
  selected: boolean
  onReuse: () => void
  onEditOutputs: () => void
  onRetry: () => void
  onAbort: () => void
  onShare: () => void
  onToggleFavorite: () => void
  onMoveCategory: () => void
  onDelete: () => void
  onPurge: () => void
  onRestore: () => void
  onClick: () => void
  onToggleSelect: () => void
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void
}

export const TOUCH_ACTION_REVEAL_DELAY = 360
