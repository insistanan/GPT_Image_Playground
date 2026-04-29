import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  ALL_CATEGORY_FILTER,
  FAVORITES_CATEGORY_FILTER,
  UNCATEGORIZED_CATEGORY_FILTER,
  type TaskRecord,
  isTaskInRecycleBin,
  resolveCategoryFilterName,
  resolveTaskCategoryName,
  resolveTaskProviderName,
} from '../../../types'
import {
  useStore,
  reuseConfig,
  editOutputs,
  retryTask,
  abortTask,
  moveTaskToCategory,
  moveTasksToCategory,
  setTasksFavorite,
  toggleTaskFavorite,
  removeTask,
  removeTasks,
  purgeTask,
  purgeTasks,
  restoreTask,
  restoreTasks,
} from '../../../store'
import MoveCategoryModal from './MoveCategoryModal'
import Select from '../../../shared/components/Select'
import TaskCard from './TaskCard'
import TaskContextMenu from './TaskContextMenu'

const INITIAL_VISIBLE_TASK_COUNT = 24
const LOAD_MORE_TASK_COUNT = 24
const BOX_SELECT_THRESHOLD = 6

function isSelectableGridTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (
    target.closest('button, input, textarea, select, a, [role="button"], [data-task-menu-root]')
  ) {
    return false
  }
  return true
}

function rectsIntersect(a: DOMRect, b: DOMRect) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

export default function TaskGrid() {
  const tasks = useStore((s) => s.tasks)
  const categories = useStore((s) => s.categories)
  const providers = useStore((s) => s.providers)
  const activeCategoryFilter = useStore((s) => s.activeCategoryFilter)
  const searchQuery = useStore((s) => s.searchQuery)
  const filterStatus = useStore((s) => s.filterStatus)
  const taskView = useStore((s) => s.taskView)
  const selectedTaskIds = useStore((s) => s.selectedTaskIds)
  const setSelectedTaskIds = useStore((s) => s.setSelectedTaskIds)
  const toggleTaskSelection = useStore((s) => s.toggleTaskSelection)
  const clearSelectedTasks = useStore((s) => s.clearSelectedTasks)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const boxSelectionRef = useRef<{
    startX: number
    startY: number
    additive: boolean
    initialSelectedIds: string[]
    startedOnTaskCard: boolean
    dragging: boolean
  } | null>(null)
  const suppressOpenUntilRef = useRef(0)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_TASK_COUNT)
  const [batchCategoryTarget, setBatchCategoryTarget] = useState(UNCATEGORIZED_CATEGORY_FILTER)
  const [movingTask, setMovingTask] = useState<TaskRecord | null>(null)
  const [moveCategoryTarget, setMoveCategoryTarget] = useState(UNCATEGORIZED_CATEGORY_FILTER)
  const [selectionBox, setSelectionBox] = useState<null | {
    left: number
    top: number
    width: number
    height: number
  }>(null)
  const [contextMenuState, setContextMenuState] = useState<{
    task: TaskRecord
    x: number
    y: number
  } | null>(null)
  const categoryIdSet = useMemo(() => new Set(categories.map((category) => category.id)), [categories])
  const sourceTasks = useMemo(
    () =>
      tasks.filter((task) =>
        taskView === 'trash' ? isTaskInRecycleBin(task) : !isTaskInRecycleBin(task),
      ),
    [taskView, tasks],
  )

  const filteredTasks = useMemo(() => {
    const sorted = [...sourceTasks].sort((a, b) => {
      const timeA = taskView === 'trash' ? a.deletedAt ?? a.createdAt : a.createdAt
      const timeB = taskView === 'trash' ? b.deletedAt ?? b.createdAt : b.createdAt
      return timeB - timeA
    })
    const q = searchQuery.trim().toLowerCase()

    return sorted.filter((t) => {
      const matchCategory =
        taskView !== 'gallery'
          ? true
          : activeCategoryFilter === ALL_CATEGORY_FILTER
            ? true
            : activeCategoryFilter === FAVORITES_CATEGORY_FILTER
              ? Boolean(t.isFavorite)
            : activeCategoryFilter === UNCATEGORIZED_CATEGORY_FILTER
              ? !t.categoryId || !categoryIdSet.has(t.categoryId)
              : t.categoryId === activeCategoryFilter
      if (!matchCategory) return false

      const matchStatus = filterStatus === 'all' || t.status === filterStatus
      if (!matchStatus) return false

      if (!q) return true
      const prompt = (t.prompt || '').toLowerCase()
      const paramStr = JSON.stringify(t.params).toLowerCase()
      const providerName = resolveTaskProviderName(t, providers).toLowerCase()
      const categoryName = resolveTaskCategoryName(t, categories).toLowerCase()
      return (
        prompt.includes(q) ||
        paramStr.includes(q) ||
        providerName.includes(q) ||
        categoryName.includes(q)
      )
    })
  }, [
    activeCategoryFilter,
    categories,
    categoryIdSet,
    filterStatus,
    providers,
    searchQuery,
    sourceTasks,
    taskView,
  ])

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_TASK_COUNT)
  }, [activeCategoryFilter, searchQuery, filterStatus, taskView])

  useEffect(() => {
    const nextTarget =
      activeCategoryFilter !== ALL_CATEGORY_FILTER &&
      activeCategoryFilter !== UNCATEGORIZED_CATEGORY_FILTER &&
      categories.some((category) => category.id === activeCategoryFilter)
        ? activeCategoryFilter
        : UNCATEGORIZED_CATEGORY_FILTER
    setBatchCategoryTarget(nextTarget)
  }, [activeCategoryFilter, categories])

  useEffect(() => {
    if (!movingTask) return
    if (moveCategoryTarget === UNCATEGORIZED_CATEGORY_FILTER) return
    if (categories.some((category) => category.id === moveCategoryTarget)) return
    setMoveCategoryTarget(UNCATEGORIZED_CATEGORY_FILTER)
  }, [categories, moveCategoryTarget, movingTask])

  useEffect(() => () => {
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    if (visibleCount >= filteredTasks.length) return
    const node = loadMoreRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) =>
            Math.min(count + LOAD_MORE_TASK_COUNT, filteredTasks.length),
          )
        }
      },
      { rootMargin: '600px 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [filteredTasks.length, visibleCount])

  useEffect(() => {
    if (!contextMenuState) return
    if (filteredTasks.some((task) => task.id === contextMenuState.task.id)) return
    setContextMenuState(null)
  }, [contextMenuState, filteredTasks])

  const renderedTasks = useMemo(
    () => filteredTasks.slice(0, visibleCount),
    [filteredTasks, visibleCount],
  )

  const selectedIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds])
  const visibleTaskIds = useMemo(() => filteredTasks.map((task) => task.id), [filteredTasks])
  const visibleTaskIdSet = useMemo(() => new Set(visibleTaskIds), [visibleTaskIds])

  const selectedTasks = useMemo(
    () => sourceTasks.filter((task) => selectedIdSet.has(task.id)),
    [sourceTasks, selectedIdSet],
  )
  const selectedCount = selectedIdSet.size
  const allSelectedFavorited = selectedTasks.length > 0 && selectedTasks.every((task) => Boolean(task.isFavorite))

  const visibleSelectedCount = useMemo(
    () => visibleTaskIds.filter((id) => selectedIdSet.has(id)).length,
    [visibleTaskIds, selectedIdSet],
  )

  const hasVisibleTasks = visibleTaskIds.length > 0
  const allVisibleSelected = hasVisibleTasks && visibleSelectedCount === visibleTaskIds.length
  const showSelectionBar = hasVisibleTasks || selectedCount > 0
  const categoryOptions = useMemo(
    () => [
      { label: '未分类', value: UNCATEGORIZED_CATEGORY_FILTER },
      ...categories.map((category) => ({
        label: category.name,
        value: category.id,
      })),
    ],
    [categories],
  )
  const activeCategoryLabel = resolveCategoryFilterName(activeCategoryFilter, categories)

  const handleDelete = (task: TaskRecord) => {
    setConfirmDialog({
      title: '移入回收站',
      message: '确定要将这条记录移入回收站吗？提示词、配置和图片会暂时保留，可在回收站恢复。',
      confirmText: '移入回收站',
      action: () => removeTask(task),
    })
  }

  const handleRestore = (task: TaskRecord) => {
    setConfirmDialog({
      title: '恢复记录',
      message: '确定要将这条记录恢复到画廊吗？',
      confirmText: '恢复',
      action: () => restoreTask(task),
    })
  }

  const handlePurge = (task: TaskRecord) => {
    setConfirmDialog({
      title: '彻底删除记录',
      message: '确定要彻底删除这条记录吗？删除后将无法恢复，并会清理未被其他任务引用的图片。',
      confirmText: '彻底删除',
      action: () => purgeTask(task),
    })
  }

  const handleAbort = (task: TaskRecord) => {
    setConfirmDialog({
      title: '确认中止生成',
      message: '确定要中止这个正在生成的任务吗？已生成的图片会保留，任务会标记为已中止。',
      confirmText: '确认中止',
      action: () => {
        void abortTask(task)
      },
    })
  }

  const handleToggleAllVisible = () => {
    if (!hasVisibleTasks) return
    if (allVisibleSelected) {
      setSelectedTaskIds(selectedTaskIds.filter((id) => !visibleTaskIdSet.has(id)))
      return
    }
    setSelectedTaskIds(Array.from(new Set([...selectedTaskIds, ...visibleTaskIds])))
  }

  const handleBatchDelete = () => {
    if (!selectedTasks.length) return
    setConfirmDialog({
      title: '批量移入回收站',
      message: `确定要将选中的 ${selectedTasks.length} 条记录移入回收站吗？提示词、配置和图片会暂时保留，可在回收站恢复。`,
      confirmText: '移入回收站',
      action: () => removeTasks(selectedTasks),
    })
  }

  const handleBatchRestore = () => {
    if (!selectedTasks.length) return
    setConfirmDialog({
      title: '批量恢复记录',
      message: `确定要恢复选中的 ${selectedTasks.length} 条记录吗？`,
      confirmText: '恢复',
      action: () => restoreTasks(selectedTasks),
    })
  }

  const handleBatchPurge = () => {
    if (!selectedTasks.length) return
    setConfirmDialog({
      title: '批量彻底删除',
      message: `确定要彻底删除选中的 ${selectedTasks.length} 条记录吗？删除后将无法恢复，并会清理未被其他任务引用的图片。`,
      confirmText: '彻底删除',
      action: () => purgeTasks(selectedTasks),
    })
  }

  const handleBatchMoveCategory = async () => {
    if (!selectedTasks.length) return
    try {
      await moveTasksToCategory(
        selectedTasks,
        batchCategoryTarget === UNCATEGORIZED_CATEGORY_FILTER ? null : batchCategoryTarget,
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const openMoveCategoryModal = (task: TaskRecord) => {
    setMovingTask(task)
    setMoveCategoryTarget(
      task.categoryId && categoryIdSet.has(task.categoryId)
        ? task.categoryId
        : UNCATEGORIZED_CATEGORY_FILTER,
    )
  }

  const handleSingleTaskMoveCategory = async () => {
    if (!movingTask) return
    try {
      await moveTaskToCategory(
        movingTask,
        moveCategoryTarget === UNCATEGORIZED_CATEGORY_FILTER ? null : moveCategoryTarget,
      )
      setMovingTask(null)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const handleBatchFavorite = async () => {
    if (!selectedTasks.length) return
    await setTasksFavorite(selectedTasks, !allSelectedFavorited)
  }

  const handleTaskContextMenu = (task: TaskRecord) => (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenuState({
      task,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const handleTaskOpen = (taskId: string) => {
    if (Date.now() < suppressOpenUntilRef.current) return
    setDetailTaskId(taskId)
  }

  const handleGridMouseDownCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !filteredTasks.length || !isSelectableGridTarget(event.target)) return

    setContextMenuState(null)
    const target = event.target instanceof HTMLElement ? event.target : null
    boxSelectionRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      additive: event.ctrlKey || event.metaKey,
      initialSelectedIds: selectedTaskIds,
      startedOnTaskCard: Boolean(target?.closest('[data-task-card-root]')),
      dragging: false,
    }

    const updateSelection = (moveEvent: MouseEvent) => {
      const currentSelection = boxSelectionRef.current
      if (!currentSelection) return

      const deltaX = moveEvent.clientX - currentSelection.startX
      const deltaY = moveEvent.clientY - currentSelection.startY
      const distance = Math.hypot(deltaX, deltaY)
      if (!currentSelection.dragging && distance < BOX_SELECT_THRESHOLD) {
        return
      }

      if (!currentSelection.dragging) {
        currentSelection.dragging = true
        document.body.style.userSelect = 'none'
      }

      const nextBox = {
        left: Math.min(currentSelection.startX, moveEvent.clientX),
        top: Math.min(currentSelection.startY, moveEvent.clientY),
        width: Math.abs(deltaX),
        height: Math.abs(deltaY),
      }
      setSelectionBox(nextBox)

      const boxRect = new DOMRect(nextBox.left, nextBox.top, nextBox.width, nextBox.height)
      const taskCards = Array.from(
        gridRef.current?.querySelectorAll<HTMLElement>('[data-task-card-root][data-task-id]') ?? [],
      )
      const hitTaskIds = taskCards
        .filter((card) => rectsIntersect(card.getBoundingClientRect(), boxRect))
        .map((card) => card.dataset.taskId || '')
        .filter(Boolean)
      setSelectedTaskIds(
        currentSelection.additive
          ? Array.from(new Set([...currentSelection.initialSelectedIds, ...hitTaskIds]))
          : hitTaskIds,
      )
    }

    const finishSelection = () => {
      const currentSelection = boxSelectionRef.current
      if (currentSelection?.dragging) {
        suppressOpenUntilRef.current = Date.now() + 180
      } else if (!currentSelection?.additive && !currentSelection?.startedOnTaskCard) {
        clearSelectedTasks()
      }
      boxSelectionRef.current = null
      setSelectionBox(null)
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', updateSelection)
      window.removeEventListener('mouseup', finishSelection)
    }

    window.addEventListener('mousemove', updateSelection)
    window.addEventListener('mouseup', finishSelection)
  }

  return (
    <div className="space-y-4" ref={gridRef} onMouseDownCapture={handleGridMouseDownCapture}>
      {showSelectionBar && (
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-white/[0.08] dark:bg-gray-900/70 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              已选 {selectedCount} 项
            </p>
            {selectedCount > visibleSelectedCount && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                当前筛选结果中命中 {visibleSelectedCount} 项
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {taskView === 'gallery' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void handleBatchFavorite()
                  }}
                  disabled={!selectedCount}
                  className="px-3 py-1.5 rounded-lg border border-amber-200/80 bg-amber-50 text-sm text-amber-600 transition hover:bg-amber-100/80 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                >
                  {allSelectedFavorited ? '取消收藏' : '加入收藏'}
                </button>
                <div className="min-w-[10rem]">
                  <Select
                    value={batchCategoryTarget}
                    onChange={(value) => setBatchCategoryTarget(String(value))}
                    options={categoryOptions}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void handleBatchMoveCategory()
                  }}
                  disabled={!selectedCount}
                  className="px-3 py-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50 text-sm text-emerald-600 transition hover:bg-emerald-100/80 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                >
                  移动分类
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleToggleAllVisible}
              disabled={!hasVisibleTasks}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
            >
              {allVisibleSelected ? '取消全选当前结果' : '全选当前结果'}
            </button>
            <button
              type="button"
              onClick={clearSelectedTasks}
              disabled={!selectedCount}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
            >
              清空选择
            </button>
            {taskView === 'trash' ? (
              <>
                <button
                  type="button"
                  onClick={handleBatchRestore}
                  disabled={!selectedCount}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40 bg-blue-500 hover:bg-blue-600"
                >
                  批量恢复
                </button>
                <button
                  type="button"
                  onClick={handleBatchPurge}
                  disabled={!selectedCount}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40 bg-red-500 hover:bg-red-600"
                >
                  批量彻底删除
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleBatchDelete}
                disabled={!selectedCount}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40 bg-red-500 hover:bg-red-600"
              >
                批量移入回收站
              </button>
            )}
          </div>
        </div>
      )}

      {!filteredTasks.length ? (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          {searchQuery ? (
            <p className="text-sm">没有找到匹配的记录</p>
          ) : taskView === 'trash' ? (
            <p className="text-sm">回收站为空</p>
          ) : activeCategoryFilter !== ALL_CATEGORY_FILTER ? (
            <p className="text-sm">分类「{activeCategoryLabel}」里还没有项目</p>
          ) : (
            <>
              <svg
                className="w-16 h-16 mx-auto mb-4 text-gray-200 dark:text-gray-700"
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
              <p className="text-sm">输入提示词开始生成图片</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
            <span>
              已显示 {Math.min(renderedTasks.length, filteredTasks.length)} / {filteredTasks.length} 条
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                categoryName={resolveTaskCategoryName(task, categories)}
                providerName={resolveTaskProviderName(task, providers)}
                isInRecycleBin={taskView === 'trash'}
                isFavorite={Boolean(task.isFavorite)}
                selected={selectedIdSet.has(task.id)}
                onClick={() => handleTaskOpen(task.id)}
                onToggleSelect={() => toggleTaskSelection(task.id)}
                onReuse={() => reuseConfig(task)}
                onEditOutputs={() => editOutputs(task)}
                onRetry={() => retryTask(task)}
                onAbort={() => handleAbort(task)}
                onToggleFavorite={() => {
                  void toggleTaskFavorite(task)
                }}
                onMoveCategory={() => openMoveCategoryModal(task)}
                onDelete={() => handleDelete(task)}
                onPurge={() => handlePurge(task)}
                onRestore={() => handleRestore(task)}
                onContextMenu={handleTaskContextMenu(task)}
              />
            ))}
          </div>
          {renderedTasks.length < filteredTasks.length && (
            <div className="flex flex-col items-center gap-3 pt-2">
              <div ref={loadMoreRef} className="h-4 w-full" />
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((count) =>
                    Math.min(count + LOAD_MORE_TASK_COUNT, filteredTasks.length),
                  )
                }
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
              >
                加载更多
              </button>
            </div>
          )}
        </>
      )}
      <MoveCategoryModal
        task={movingTask}
        categories={categories}
        targetCategory={moveCategoryTarget}
        onTargetCategoryChange={setMoveCategoryTarget}
        onClose={() => setMovingTask(null)}
        onConfirm={() => {
          void handleSingleTaskMoveCategory()
        }}
      />
      {selectionBox && (
        <div
          className="pointer-events-none fixed z-[9997] rounded-2xl border border-blue-400/80 bg-blue-400/12 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]"
          style={{
            left: selectionBox.left,
            top: selectionBox.top,
            width: selectionBox.width,
            height: selectionBox.height,
          }}
        />
      )}
      <TaskContextMenu
        task={contextMenuState?.task ?? null}
        x={contextMenuState?.x ?? 0}
        y={contextMenuState?.y ?? 0}
        isInRecycleBin={taskView === 'trash'}
        onClose={() => setContextMenuState(null)}
        onOpen={() => {
          if (contextMenuState?.task) {
            handleTaskOpen(contextMenuState.task.id)
          }
        }}
        onReuse={() => {
          if (contextMenuState?.task) {
            void reuseConfig(contextMenuState.task)
          }
        }}
        onEdit={() => {
          if (contextMenuState?.task) {
            void editOutputs(contextMenuState.task)
          }
        }}
        onRetry={() => {
          if (contextMenuState?.task) {
            void retryTask(contextMenuState.task)
          }
        }}
        onToggleFavorite={() => {
          if (contextMenuState?.task) {
            void toggleTaskFavorite(contextMenuState.task)
          }
        }}
        onMoveCategory={() => {
          if (contextMenuState?.task) {
            openMoveCategoryModal(contextMenuState.task)
          }
        }}
        onDelete={() => {
          if (contextMenuState?.task) {
            handleDelete(contextMenuState.task)
          }
        }}
        onPurge={() => {
          if (contextMenuState?.task) {
            handlePurge(contextMenuState.task)
          }
        }}
        onRestore={() => {
          if (contextMenuState?.task) {
            handleRestore(contextMenuState.task)
          }
        }}
      />
    </div>
  )
}
