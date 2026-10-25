import type { TaskRecord } from '@/types'
import { canRetryTask, resolveTaskKind } from '@/store'

interface TaskCardActionsProps {
  isInRecycleBin: boolean
  task: TaskRecord
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

export default function TaskCardActions({
  isInRecycleBin,
  task,
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
      className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      {isInRecycleBin ? (
        <>
          <button
            type="button"
            onClick={onRestore}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-gray-400 transition-all duration-200 hover:-translate-y-px hover:border-blue-100 hover:bg-blue-50 hover:text-blue-500 dark:hover:border-blue-500/10 dark:hover:bg-blue-950/30"
            title="恢复记录"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8h5m0 0v5m0-5l-6 6m-7 2a8 8 0 008 8h5" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onPurge}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-gray-400 transition-all duration-200 hover:-translate-y-px hover:border-red-100 hover:bg-red-50 hover:text-red-500 dark:hover:border-red-500/10 dark:hover:bg-red-950/30"
            title="彻底删除"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onReuse}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-gray-400 transition-all duration-200 hover:-translate-y-px hover:border-blue-100 hover:bg-blue-50 hover:text-blue-500 dark:hover:border-blue-500/10 dark:hover:bg-blue-950/30"
            title="复用配置"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>

          {showEditButton && (
            <button
              type="button"
              onClick={onEditOutputs}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-gray-400 transition-all duration-200 hover:-translate-y-px hover:border-green-100 hover:bg-green-50 hover:text-green-500 disabled:opacity-30 dark:hover:border-green-500/10 dark:hover:bg-green-950/30"
              title="编辑输出"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}

          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-gray-400 transition-all duration-200 hover:-translate-y-px hover:border-amber-100 hover:bg-amber-50 hover:text-amber-500 dark:hover:border-amber-500/10 dark:hover:bg-amber-950/30"
              title="重试"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m14.216 2A7.5 7.5 0 005.582 9m0 0H10m10 11v-5h-.581m0 0H14a7.5 7.5 0 01-13.418-2" />
              </svg>
            </button>
          )}

          {canShare && (
            <button
              type="button"
              onClick={onShare}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-gray-400 transition-all duration-200 hover:-translate-y-px hover:border-blue-100 hover:bg-blue-50 hover:text-blue-500 dark:hover:border-blue-500/10 dark:hover:bg-blue-950/30"
              title="分享到广场"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8.5 12 4m0 0 5 4.5M12 4v12" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 14.5v2.75A2.75 2.75 0 0 0 7.75 20h8.5A2.75 2.75 0 0 0 19 17.25V14.5" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={onMoveCategory}
            className="inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-1.5 text-[11px] font-medium text-gray-500 transition-all duration-200 hover:-translate-y-px hover:border-amber-100 hover:bg-amber-50 hover:text-amber-600 dark:hover:border-amber-500/10 dark:hover:bg-amber-950/30 dark:hover:text-amber-300"
            title="移动分类"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2zM12 11v6m0 0l-3-3m3 3l3-3" />
            </svg>
            <span>分类</span>
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-gray-400 transition-all duration-200 hover:-translate-y-px hover:border-red-100 hover:bg-red-50 hover:text-red-500 dark:hover:border-red-500/10 dark:hover:bg-red-950/30"
            title="移入回收站"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}
