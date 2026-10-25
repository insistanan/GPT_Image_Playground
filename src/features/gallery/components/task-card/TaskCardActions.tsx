import type { ReactNode } from 'react'
import type { TaskRecord } from '@/types'
import { canRetryTask, resolveTaskKind } from '@/store'

interface TaskCardActionsProps {
  isInRecycleBin: boolean
  task: TaskRecord
  categoryName: string
  canEditOutputs: boolean
  onReuse: () => void
  onEditOutputs: () => void
  onRetry: () => void
  onShare: () => void
  onMoveCategory: () => void
  onDelete: () => void
  onPurge: () => void
  onRestore: () => void
}

type ActionTone = 'blue' | 'green' | 'amber' | 'red'

const ACTION_BUTTON_CLASS =
  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors duration-150 dark:text-gray-500'

const ACTION_TONE_CLASS: Record<ActionTone, string> = {
  blue: 'hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-300',
  green: 'hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300',
  amber: 'hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-300',
  red: 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300',
}

function ActionButton({
  title,
  tone,
  onClick,
  children,
}: {
  title: string
  tone: ActionTone
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${ACTION_BUTTON_CLASS} ${ACTION_TONE_CLASS[tone]}`}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  )
}

export default function TaskCardActions({
  isInRecycleBin,
  task,
  categoryName,
  canEditOutputs,
  onReuse,
  onEditOutputs,
  onRetry,
  onShare,
  onMoveCategory,
  onDelete,
  onPurge,
  onRestore,
}: TaskCardActionsProps) {
  const canRetry = canRetryTask(task)
  const showEditButton = canEditOutputs
  const canShare = task.status === 'done' && resolveTaskKind(task) !== 'image'

  return (
    <div
      className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1"
      onClick={(event) => event.stopPropagation()}
    >
      {isInRecycleBin ? (
        <>
          <ActionButton title="恢复记录" tone="blue" onClick={onRestore}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8h5m0 0v5m0-5l-6 6m-7 2a8 8 0 008 8h5" />
            </svg>
          </ActionButton>

          <ActionButton title="彻底删除" tone="red" onClick={onPurge}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </ActionButton>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onMoveCategory}
            className={`mr-auto inline-flex h-7 min-w-0 max-w-[7rem] shrink items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-gray-500 transition-colors duration-150 dark:text-gray-400 ${ACTION_TONE_CLASS.amber}`}
            title={`移动分类（当前：${categoryName}）`}
            aria-label="移动分类"
          >
            <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2zM12 11v6m0 0l-3-3m3 3l3-3" />
            </svg>
            <span className="min-w-0 truncate">{categoryName}</span>
          </button>

          <ActionButton title="复用配置" tone="blue" onClick={onReuse}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </ActionButton>

          {showEditButton && (
            <ActionButton title="编辑输出" tone="green" onClick={onEditOutputs}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </ActionButton>
          )}

          {canRetry && (
            <ActionButton title="重试" tone="amber" onClick={onRetry}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m14.216 2A7.5 7.5 0 005.582 9m0 0H10m10 11v-5h-.581m0 0H14a7.5 7.5 0 01-13.418-2" />
              </svg>
            </ActionButton>
          )}

          {canShare && (
            <ActionButton title="分享到广场" tone="blue" onClick={onShare}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8.5 12 4m0 0 5 4.5M12 4v12" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 14.5v2.75A2.75 2.75 0 0 0 7.75 20h8.5A2.75 2.75 0 0 0 19 17.25V14.5" />
              </svg>
            </ActionButton>
          )}

          <ActionButton title="移入回收站" tone="red" onClick={onDelete}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </ActionButton>
        </>
      )}
    </div>
  )
}
