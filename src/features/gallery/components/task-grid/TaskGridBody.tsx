import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { resolveTaskCategoryName, resolveTaskProviderName } from '@/store'
import {
  ALL_CATEGORY_FILTER,
  type CategoryConfig,
  type ProviderConfig,
  type TaskRecord,
  type TaskView,
} from '@/types'
import TaskCard from '@/features/gallery/components/task-card/TaskCard'
import { useVirtualTaskGrid } from './useVirtualTaskGrid'

interface TaskGridBodyProps {
  filteredTaskCount: number
  tasks: TaskRecord[]
  selectedCount: number
  categories: CategoryConfig[]
  providers: ProviderConfig[]
  selectedIdSet: Set<string>
  activeCategoryFilter: string
  activeCategoryLabel: string
  searchQuery: string
  taskView: TaskView
  wrapperRef: RefObject<HTMLDivElement | null>
  gridRef: RefObject<HTMLDivElement | null>
  onGridMouseDownCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  onTaskOpen: (taskId: string) => void
  onToggleTaskSelection: (taskId: string) => void
  onTaskReuse: (task: TaskRecord) => void
  onTaskEditOutputs: (task: TaskRecord) => void
  onTaskRetry: (task: TaskRecord) => void
  onTaskAbort: (task: TaskRecord) => void
  onTaskShare: (task: TaskRecord) => void
  onTaskToggleFavorite: (task: TaskRecord) => void
  onTaskMoveCategory: (task: TaskRecord) => void
  onTaskDelete: (task: TaskRecord) => void
  onTaskPurge: (task: TaskRecord) => void
  onTaskRestore: (task: TaskRecord) => void
  onTaskContextMenu: (task: TaskRecord, event: ReactMouseEvent<HTMLDivElement>) => void
}

export default function TaskGridBody({
  filteredTaskCount,
  tasks,
  selectedCount,
  categories,
  providers,
  selectedIdSet,
  activeCategoryFilter,
  activeCategoryLabel,
  searchQuery,
  taskView,
  wrapperRef,
  gridRef,
  onGridMouseDownCapture,
  onTaskOpen,
  onToggleTaskSelection,
  onTaskReuse,
  onTaskEditOutputs,
  onTaskRetry,
  onTaskAbort,
  onTaskShare,
  onTaskToggleFavorite,
  onTaskMoveCategory,
  onTaskDelete,
  onTaskPurge,
  onTaskRestore,
  onTaskContextMenu,
}: TaskGridBodyProps) {
  const virtualGrid = useVirtualTaskGrid({
    wrapperRef,
    gridRef,
    tasks,
    layoutVersion: selectedCount,
  })

  if (!filteredTaskCount) {
    return (
      <div className="py-20 text-center text-gray-400 dark:text-gray-500">
        {searchQuery ? (
          <p className="text-sm">没有找到匹配的记录</p>
        ) : taskView === 'trash' ? (
          <p className="text-sm">回收站为空</p>
        ) : activeCategoryFilter !== ALL_CATEGORY_FILTER ? (
          <p className="text-sm">分类「{activeCategoryLabel}」里还没有项目</p>
        ) : (
          <>
            <svg
              className="mx-auto mb-4 h-16 w-16 text-gray-200 dark:text-gray-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm">输入提示词生成图片，或直接拖图、粘图到这里</p>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>
          {taskView === 'trash' ? '回收站' : '画廊'} {filteredTaskCount} 条
        </span>
      </div>

      <div
        ref={gridRef}
        onMouseDownCapture={onGridMouseDownCapture}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {virtualGrid.topSpacerHeight > 0 && (
          <div
            aria-hidden
            className="col-span-full"
            style={{ height: `${virtualGrid.topSpacerHeight}px` }}
          />
        )}

        {virtualGrid.renderedTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            categoryName={resolveTaskCategoryName(task, categories)}
            providerName={resolveTaskProviderName(task, providers)}
            isInRecycleBin={taskView === 'trash'}
            isFavorite={Boolean(task.isFavorite)}
            selected={selectedIdSet.has(task.id)}
            onClick={() => onTaskOpen(task.id)}
            onToggleSelect={() => onToggleTaskSelection(task.id)}
            onReuse={() => onTaskReuse(task)}
            onEditOutputs={() => onTaskEditOutputs(task)}
            onRetry={() => onTaskRetry(task)}
            onAbort={() => onTaskAbort(task)}
            onShare={() => onTaskShare(task)}
            onToggleFavorite={() => onTaskToggleFavorite(task)}
            onMoveCategory={() => onTaskMoveCategory(task)}
            onDelete={() => onTaskDelete(task)}
            onPurge={() => onTaskPurge(task)}
            onRestore={() => onTaskRestore(task)}
            onContextMenu={(event) => onTaskContextMenu(task, event)}
          />
        ))}
        {virtualGrid.bottomSpacerHeight > 0 && (
          <div
            aria-hidden
            className="col-span-full"
            style={{ height: `${virtualGrid.bottomSpacerHeight}px` }}
          />
        )}
      </div>
    </>
  )
}
