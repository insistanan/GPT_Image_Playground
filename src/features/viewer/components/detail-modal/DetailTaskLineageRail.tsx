import { useImageAssetView } from '@/hooks/useImageAssetView'
import { resolveTaskKind, resolveTaskStatusLabel } from '@/store'
import type { TaskRecord } from '@/types'
import { formatLocaleTime } from './shared'

export interface DetailTaskLineageRailItem {
  task: TaskRecord | null
  taskId: string
  relationImageId: string | null
  depth: number
  isEntry: boolean
  isMissing: boolean
  isLoop: boolean
}

interface DetailTaskLineageRailProps {
  activeTaskId: string
  items: DetailTaskLineageRailItem[]
  onOpenTask: (taskId: string) => void
}

function buildTaskPreview(task: TaskRecord | null) {
  if (!task) {
    return '(来源任务缺失)'
  }

  if (resolveTaskKind(task) === 'image') {
    return '(单图任务)'
  }

  const prompt = task.prompt?.trim()
  if (prompt) {
    return prompt
  }

  if (task.inputImageIds.length > 0 && task.outputImages.length > 0) {
    return '(无提示词，含输入图与输出图)'
  }

  if (task.inputImageIds.length > 0) {
    return '(无提示词，仅含输入图)'
  }

  if (task.outputImages.length > 0) {
    return '(无提示词，仅含输出图)'
  }

  return '(空任务)'
}

function DetailTaskLineageRailCard(props: {
  item: DetailTaskLineageRailItem
  isActive: boolean
  onOpenTask: (taskId: string) => void
}) {
  const { item, isActive, onOpenTask } = props
  const task = item.task
  const previewImageId = item.relationImageId ?? task?.outputImages?.[0] ?? ''
  const { url: previewImageSrc, status: previewStatus } = useImageAssetView(previewImageId, {
    variant: 'thumbnail',
  })
  const statusLabel = task ? resolveTaskStatusLabel(task) : item.isLoop ? '循环引用' : '已缺失'
  const preview = buildTaskPreview(task)

  return (
    <button
      type="button"
      onClick={() => {
        if (task) {
          onOpenTask(task.id)
        }
      }}
      disabled={!task}
      className={`w-full overflow-hidden rounded-2xl border text-left transition disabled:cursor-default disabled:opacity-70 ${
        isActive
          ? 'border-blue-300 bg-blue-50/70 ring-1 ring-blue-200 dark:border-blue-400/40 dark:bg-blue-500/10 dark:ring-blue-400/20'
          : 'border-gray-200/80 bg-white hover:border-blue-200 hover:bg-blue-50/40 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-blue-400/30 dark:hover:bg-blue-500/10'
      }`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-black/20">
        {previewImageSrc ? (
          <img src={previewImageSrc} alt="" className="h-full w-full object-cover" />
        ) : previewStatus === 'loading' ? (
          <div className="flex h-full w-full items-center justify-center">
            <svg className="h-6 w-6 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400 dark:text-gray-500">
            无预览图
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {item.isEntry ? '入口任务' : `上游 ${item.depth}`}
          </span>
          {item.relationImageId ? (
            <span className="max-w-[7rem] truncate rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-medium text-gray-700 backdrop-blur-sm dark:bg-black/55 dark:text-gray-100">
              关联图 {item.relationImageId.slice(0, 8)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              {statusLabel}
            </span>
            {isActive ? (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
                当前查看
              </span>
            ) : null}
          </div>
          {task ? (
            <span className="text-xs font-medium text-blue-600 dark:text-blue-300">切换详情</span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-sm leading-6 text-gray-700 dark:text-gray-200">{preview}</p>
        <div className="text-[11px] text-gray-400 dark:text-gray-500">
          <span>任务 ID {item.taskId}</span>
          {task ? <span> · {formatLocaleTime(task.createdAt)}</span> : null}
        </div>
      </div>
    </button>
  )
}

export default function DetailTaskLineageRail(props: DetailTaskLineageRailProps) {
  const { activeTaskId, items, onOpenTask } = props

  if (items.length === 0) {
    return null
  }

  const orderedItems = [...items].reverse()

  return (
    <aside className="w-full flex-shrink-0 border-t border-gray-200/70 bg-gray-50/70 p-4 md:w-[17rem] md:border-l md:border-t-0 dark:border-white/[0.08] dark:bg-black/10">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">来源任务链</h3>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
          本次查看会固定保留最初打开时的链路，可在其中自由切换历史详情。
        </p>
      </div>

      <div className="space-y-3 overflow-y-auto md:max-h-[calc(90vh-2rem)]">
        {orderedItems.map((item) => (
          <DetailTaskLineageRailCard
            key={`${item.isEntry ? 'entry' : 'upstream'}-${item.depth}-${item.taskId}-${item.relationImageId ?? 'none'}`}
            item={item}
            isActive={item.taskId === activeTaskId}
            onOpenTask={onOpenTask}
          />
        ))}
      </div>
    </aside>
  )
}
