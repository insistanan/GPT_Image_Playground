import type { TaskRecord } from '@/types'
import { canRetryTask, resolveTaskKind } from '@/store'

interface DetailInfoActionsProps {
  task: TaskRecord
  inRecycleBin: boolean
  canEditOutputs: boolean
  onReuse: () => void
  onEdit: () => void
  onRetry: () => void
  onShare: () => void
  onDelete: () => void
  onRestore: () => void
  onPurge: () => void
}

export default function DetailInfoActions(props: DetailInfoActionsProps) {
  const { task, inRecycleBin, canEditOutputs, onReuse, onEdit, onRetry, onShare, onDelete, onRestore, onPurge } = props
  const canRetry = canRetryTask(task)
  const showEditAction = canEditOutputs
  const canShare = task.status === 'done' && resolveTaskKind(task) !== 'image'

  return (
    <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-white/[0.08]">
      {inRecycleBin ? (
        <>
          <button
            type="button"
            onClick={onRestore}
            className="flex-1 whitespace-nowrap rounded-lg bg-blue-50 px-2 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-100 sm:px-3 sm:text-sm dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20"
          >
            <span className="flex items-center justify-center gap-1.5">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8h5m0 0v5m0-5l-6 6m-7 2a8 8 0 008 8h5" />
              </svg>
              恢复记录
            </span>
          </button>
          <button
            type="button"
            onClick={onPurge}
            className="flex-1 whitespace-nowrap rounded-lg bg-red-50 px-2 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100 sm:px-3 sm:text-sm dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
          >
            <span className="flex items-center justify-center gap-1.5">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              彻底删除
            </span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onReuse}
            className="flex-1 whitespace-nowrap rounded-lg bg-blue-50 px-2 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-100 sm:px-3 sm:text-sm dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20"
          >
            <span className="flex items-center justify-center gap-1.5">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              复用配置
            </span>
          </button>
          {showEditAction && (
            <button
              type="button"
              onClick={onEdit}
              className="flex-1 whitespace-nowrap rounded-lg bg-green-50 px-2 py-2 text-xs font-medium text-green-600 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:text-sm dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20"
            >
              <span className="flex items-center justify-center gap-1.5">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                编辑输出
              </span>
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex-1 whitespace-nowrap rounded-lg bg-amber-50 px-2 py-2 text-xs font-medium text-amber-600 transition hover:bg-amber-100 sm:px-3 sm:text-sm dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
            >
              <span className="flex items-center justify-center gap-1.5">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m14.216 2A7.5 7.5 0 005.582 9m0 0H10m10 11v-5h-.581m0 0H14a7.5 7.5 0 01-13.418-2" />
                </svg>
                重试
              </span>
            </button>
          )}
          {canShare && (
            <button
              type="button"
              onClick={onShare}
              className="flex-1 whitespace-nowrap rounded-lg bg-blue-50 px-2 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-100 sm:px-3 sm:text-sm dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
            >
              <span className="flex items-center justify-center gap-1.5">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8.5 12 4m0 0 5 4.5M12 4v12" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 14.5v2.75A2.75 2.75 0 0 0 7.75 20h8.5A2.75 2.75 0 0 0 19 17.25V14.5" />
                </svg>
                分享
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="flex-1 whitespace-nowrap rounded-lg bg-red-50 px-2 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100 sm:px-3 sm:text-sm dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
          >
            <span className="flex items-center justify-center gap-1.5">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              移入回收站
            </span>
          </button>
        </>
      )}
    </div>
  )
}
