import Select from '@/shared/components/Select'
import type { TaskView } from '@/types'
import type { CategoryOption } from './shared'

interface SelectionToolbarProps {
  taskView: TaskView
  selectedCount: number
  visibleSelectedCount: number
  allSelectedFavorited: boolean
  batchCategoryTarget: string
  categoryOptions: CategoryOption[]
  hasVisibleTasks: boolean
  allVisibleSelected: boolean
  onBatchCategoryTargetChange: (value: string) => void
  onBatchFavorite: () => void
  onBatchMoveCategory: () => void
  onToggleAllVisible: () => void
  onClearSelected: () => void
  onBatchRestore: () => void
  onBatchPurge: () => void
  onBatchDelete: () => void
}

export default function SelectionToolbar({
  taskView,
  selectedCount,
  visibleSelectedCount,
  allSelectedFavorited,
  batchCategoryTarget,
  categoryOptions,
  hasVisibleTasks,
  allVisibleSelected,
  onBatchCategoryTargetChange,
  onBatchFavorite,
  onBatchMoveCategory,
  onToggleAllVisible,
  onClearSelected,
  onBatchRestore,
  onBatchPurge,
  onBatchDelete,
}: SelectionToolbarProps) {
  return (
    <div className="flex flex-col gap-2 rounded-[1.35rem] border border-gray-200/80 bg-white/[0.94] px-3 py-2.5 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.48)] backdrop-blur-md dark:border-white/[0.08] dark:bg-gray-900/[0.84] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-100">
          已选 {selectedCount} 项
        </p>
        {selectedCount > visibleSelectedCount && (
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            当前筛选结果中命中 {visibleSelectedCount} 项
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {taskView === 'gallery' && (
          <>
            <button
              type="button"
              onClick={onBatchFavorite}
              disabled={!selectedCount}
              className="h-8 rounded-full border border-amber-200/80 bg-amber-50 px-3 text-[12px] font-medium text-amber-600 transition-all duration-200 hover:-translate-y-px hover:bg-amber-100/80 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
            >
              {allSelectedFavorited ? '取消收藏' : '加入收藏'}
            </button>

            <div className="min-w-[10rem]">
              <Select
                value={batchCategoryTarget}
                onChange={(value) => onBatchCategoryTargetChange(String(value))}
                options={categoryOptions}
                className="h-8 rounded-full border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 transition-all duration-200 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              />
            </div>

            <button
              type="button"
              onClick={onBatchMoveCategory}
              disabled={!selectedCount}
              className="h-8 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 text-[12px] font-medium text-emerald-600 transition-all duration-200 hover:-translate-y-px hover:bg-emerald-100/80 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
            >
              移动分类
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onToggleAllVisible}
          disabled={!hasVisibleTasks}
          className="h-8 rounded-full border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 transition-all duration-200 hover:-translate-y-px hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.04]"
        >
          {allVisibleSelected ? '取消全选当前结果' : '全选当前结果'}
        </button>

        <button
          type="button"
          onClick={onClearSelected}
          disabled={!selectedCount}
          className="h-8 rounded-full border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 transition-all duration-200 hover:-translate-y-px hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.04]"
        >
          清空选择
        </button>

        {taskView === 'trash' ? (
          <>
            <button
              type="button"
              onClick={onBatchRestore}
              disabled={!selectedCount}
              className="h-8 rounded-full bg-blue-500 px-3 text-[12px] font-medium text-white transition-all duration-200 hover:-translate-y-px hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              批量恢复
            </button>

            <button
              type="button"
              onClick={onBatchPurge}
              disabled={!selectedCount}
              className="h-8 rounded-full bg-red-500 px-3 text-[12px] font-medium text-white transition-all duration-200 hover:-translate-y-px hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              批量彻底删除
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onBatchDelete}
            disabled={!selectedCount}
            className="h-8 rounded-full bg-red-500 px-3 text-[12px] font-medium text-white transition-all duration-200 hover:-translate-y-px hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            批量移入回收站
          </button>
        )}
      </div>
    </div>
  )
}
