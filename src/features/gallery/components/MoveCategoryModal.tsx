import type { CategoryConfig, TaskRecord } from '../../../types'
import {
  UNCATEGORIZED_CATEGORY_FILTER,
  resolveTaskCategoryName,
} from '../../../types'
import { useCloseOnEscape } from '../../../hooks/useCloseOnEscape'
import Select from '../../../shared/components/Select'

interface Props {
  task: TaskRecord | null
  categories: CategoryConfig[]
  targetCategory: string
  onTargetCategoryChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
}

export default function MoveCategoryModal({
  task,
  categories,
  targetCategory,
  onTargetCategoryChange,
  onClose,
  onConfirm,
}: Props) {
  useCloseOnEscape(Boolean(task), onClose)

  if (!task) return null

  const categoryOptions = [
    { label: '未分类', value: UNCATEGORIZED_CATEGORY_FILTER },
    ...categories.map((category) => ({
      label: category.name,
      value: category.id,
    })),
  ]
  const promptPreview = task.prompt?.trim() || '(无提示词)'
  const currentCategoryName = resolveTaskCategoryName(task, categories)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-md animate-overlay-in" />
      <div
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/50 bg-white/90 p-5 shadow-[0_8px_40px_rgb(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-xl animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/90 dark:ring-white/10 dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">移动分类</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              更改这条画廊记录的归属分类
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-gray-200/80 bg-gray-50/70 p-3 dark:border-white/[0.08] dark:bg-black/20">
            <p className="text-xs text-gray-400 dark:text-gray-500">当前分类</p>
            <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-200">
              {currentCategoryName}
            </p>
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
              {promptPreview}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
              目标分类
            </label>
            <Select
              value={targetCategory}
              onChange={(value) => onTargetCategoryChange(String(value))}
              options={categoryOptions}
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.04]"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
