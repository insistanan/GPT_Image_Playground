import { type MouseEvent as ReactMouseEvent, useCallback } from 'react'
import { abortTask, moveTaskToCategory, moveTasksToCategory, purgeTask, purgeTasks, removeTask, removeTasks, restoreTask, restoreTasks, setTasksFavorite } from '../../../../store'
import { UNCATEGORIZED_CATEGORY_FILTER, type TaskRecord } from '../../../../types'
import type { TaskContextMenuState } from './shared'

interface UseTaskGridActionsOptions {
  selectedTaskIds: string[]
  visibleTaskIds: string[]
  visibleTaskIdSet: Set<string>
  selectedTasks: TaskRecord[]
  allSelectedFavorited: boolean
  hasVisibleTasks: boolean
  allVisibleSelected: boolean
  batchCategoryTarget: string
  movingTask: TaskRecord | null
  moveCategoryTarget: string
  setSelectedTaskIds: (taskIds: string[]) => void
  setMovingTask: (task: TaskRecord | null) => void
  setMoveCategoryTarget: (value: string) => void
  setContextMenuState: (state: TaskContextMenuState | null) => void
  setDetailTaskId: (taskId: string | null) => void
  setConfirmDialog: (dialog: {
    title: string
    message: string
    confirmText?: string
    action: () => void | Promise<void>
  }) => void
  showToast: (message: string, tone?: 'success' | 'error' | 'info') => void
  shouldSuppressTaskOpen: () => boolean
  categoryIdSet: Set<string>
}

export function useTaskGridActions(options: UseTaskGridActionsOptions) {
  const {
    selectedTaskIds,
    visibleTaskIds,
    visibleTaskIdSet,
    selectedTasks,
    allSelectedFavorited,
    hasVisibleTasks,
    allVisibleSelected,
    batchCategoryTarget,
    movingTask,
    moveCategoryTarget,
    setSelectedTaskIds,
    setMovingTask,
    setMoveCategoryTarget,
    setContextMenuState,
    setDetailTaskId,
    setConfirmDialog,
    showToast,
    shouldSuppressTaskOpen,
    categoryIdSet,
  } = options

  const handleDelete = useCallback(
    (task: TaskRecord) => {
      setConfirmDialog({
        title: '移入回收站',
        message: '确定要将这条记录移入回收站吗？提示词、配置和图片会暂时保留，可在回收站恢复。',
        confirmText: '移入回收站',
        action: () => removeTask(task),
      })
    },
    [setConfirmDialog],
  )

  const handleRestore = useCallback(
    (task: TaskRecord) => {
      setConfirmDialog({
        title: '恢复记录',
        message: '确定要将这条记录恢复到画廊吗？',
        confirmText: '恢复',
        action: () => restoreTask(task),
      })
    },
    [setConfirmDialog],
  )

  const handlePurge = useCallback(
    (task: TaskRecord) => {
      setConfirmDialog({
        title: '彻底删除记录',
        message: '确定要彻底删除这条记录吗？删除后将无法恢复，并会清理未被其他任务引用的图片。',
        confirmText: '彻底删除',
        action: async () => {
          await purgeTask(task)
        },
      })
    },
    [setConfirmDialog],
  )

  const handleAbort = useCallback(
    (task: TaskRecord) => {
      setConfirmDialog({
        title: '确认中止生成',
        message: '确定要中止这个正在生成的任务吗？已生成的图片会保留，任务会标记为已中止。',
        confirmText: '确认中止',
        action: () => {
          void abortTask(task)
        },
      })
    },
    [setConfirmDialog],
  )

  const handleToggleAllVisible = useCallback(() => {
    if (!hasVisibleTasks) return

    if (allVisibleSelected) {
      setSelectedTaskIds(selectedTaskIds.filter((taskId) => !visibleTaskIdSet.has(taskId)))
      return
    }

    setSelectedTaskIds(Array.from(new Set([...selectedTaskIds, ...visibleTaskIds])))
  }, [
    allVisibleSelected,
    hasVisibleTasks,
    selectedTaskIds,
    setSelectedTaskIds,
    visibleTaskIdSet,
    visibleTaskIds,
  ])

  const handleBatchDelete = useCallback(() => {
    if (!selectedTasks.length) return

    setConfirmDialog({
      title: '批量移入回收站',
      message: `确定要将选中的 ${selectedTasks.length} 条记录移入回收站吗？提示词、配置和图片会暂时保留，可在回收站恢复。`,
      confirmText: '移入回收站',
      action: () => removeTasks(selectedTasks),
    })
  }, [selectedTasks, setConfirmDialog])

  const handleBatchRestore = useCallback(() => {
    if (!selectedTasks.length) return

    setConfirmDialog({
      title: '批量恢复记录',
      message: `确定要恢复选中的 ${selectedTasks.length} 条记录吗？`,
      confirmText: '恢复',
      action: () => restoreTasks(selectedTasks),
    })
  }, [selectedTasks, setConfirmDialog])

  const handleBatchPurge = useCallback(() => {
    if (!selectedTasks.length) return

    setConfirmDialog({
      title: '批量彻底删除',
      message: `确定要彻底删除选中的 ${selectedTasks.length} 条记录吗？删除后将无法恢复，并会清理未被其他任务引用的图片。`,
      confirmText: '彻底删除',
      action: async () => {
        await purgeTasks(selectedTasks)
      },
    })
  }, [selectedTasks, setConfirmDialog])

  const handleBatchMoveCategory = useCallback(async () => {
    if (!selectedTasks.length) return

    try {
      await moveTasksToCategory(
        selectedTasks,
        batchCategoryTarget === UNCATEGORIZED_CATEGORY_FILTER ? null : batchCategoryTarget,
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }, [batchCategoryTarget, selectedTasks, showToast])

  const openMoveCategoryModal = useCallback(
    (task: TaskRecord) => {
      setMovingTask(task)
      setMoveCategoryTarget(
        task.categoryId && categoryIdSet.has(task.categoryId)
          ? task.categoryId
          : UNCATEGORIZED_CATEGORY_FILTER,
      )
    },
    [categoryIdSet, setMoveCategoryTarget, setMovingTask],
  )

  const handleSingleTaskMoveCategory = useCallback(async () => {
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
  }, [moveCategoryTarget, movingTask, setMovingTask, showToast])

  const handleBatchFavorite = useCallback(async () => {
    if (!selectedTasks.length) return
    await setTasksFavorite(selectedTasks, !allSelectedFavorited)
  }, [allSelectedFavorited, selectedTasks])

  const handleTaskContextMenu = useCallback(
    (task: TaskRecord, event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setContextMenuState({
        task,
        x: event.clientX,
        y: event.clientY,
      })
    },
    [setContextMenuState],
  )

  const handleTaskOpen = useCallback(
    (taskId: string) => {
      if (shouldSuppressTaskOpen()) return
      setDetailTaskId(taskId)
    },
    [setDetailTaskId, shouldSuppressTaskOpen],
  )

  return {
    handleDelete,
    handleRestore,
    handlePurge,
    handleAbort,
    handleToggleAllVisible,
    handleBatchDelete,
    handleBatchRestore,
    handleBatchPurge,
    handleBatchMoveCategory,
    openMoveCategoryModal,
    handleSingleTaskMoveCategory,
    handleBatchFavorite,
    handleTaskContextMenu,
    handleTaskOpen,
  }
}
