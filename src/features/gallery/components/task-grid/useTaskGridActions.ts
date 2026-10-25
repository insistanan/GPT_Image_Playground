import { type MouseEvent as ReactMouseEvent, useCallback } from 'react'
import {
  confirmGalleryBatchPurgeTasks,
  confirmGalleryBatchRemoveTasks,
  confirmGalleryBatchRestoreTasks,
  confirmGalleryPurgeTask,
  confirmGalleryRemoveTask,
  confirmGalleryRestoreTask,
  openGalleryMoveCategoryDialog,
  runGalleryAbort,
  runGalleryBatchFavorite,
  runGalleryBatchMoveToCategory,
  runGalleryMoveTaskToCategory,
} from '@/store'
import type { TaskRecord } from '@/types'
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
  shouldSuppressTaskOpen: () => boolean
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
    shouldSuppressTaskOpen,
  } = options

  const handleDelete = useCallback(
    (task: TaskRecord) => {
      confirmGalleryRemoveTask(task)
    },
    [],
  )

  const handleRestore = useCallback(
    (task: TaskRecord) => {
      confirmGalleryRestoreTask(task)
    },
    [],
  )

  const handlePurge = useCallback(
    (task: TaskRecord) => {
      confirmGalleryPurgeTask(task)
    },
    [],
  )

  const handleAbort = useCallback(
    (task: TaskRecord) => {
      runGalleryAbort(task)
    },
    [],
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

    confirmGalleryBatchRemoveTasks(selectedTasks)
  }, [selectedTasks])

  const handleBatchRestore = useCallback(() => {
    if (!selectedTasks.length) return

    confirmGalleryBatchRestoreTasks(selectedTasks)
  }, [selectedTasks])

  const handleBatchPurge = useCallback(() => {
    if (!selectedTasks.length) return

    confirmGalleryBatchPurgeTasks(selectedTasks)
  }, [selectedTasks])

  const handleBatchMoveCategory = useCallback(async () => {
    if (!selectedTasks.length) return

    await runGalleryBatchMoveToCategory(selectedTasks, batchCategoryTarget)
  }, [batchCategoryTarget, selectedTasks])

  const openMoveCategoryModal = useCallback(
    (task: TaskRecord) => {
      const dialogState = openGalleryMoveCategoryDialog(task)
      setMovingTask(dialogState.task)
      setMoveCategoryTarget(dialogState.targetCategory)
    },
    [setMoveCategoryTarget, setMovingTask],
  )

  const handleSingleTaskMoveCategory = useCallback(async () => {
    if (!movingTask) return

    await runGalleryMoveTaskToCategory(movingTask, moveCategoryTarget)
    setMovingTask(null)
  }, [moveCategoryTarget, movingTask, setMovingTask])

  const handleBatchFavorite = useCallback(async () => {
    if (!selectedTasks.length) return

    await runGalleryBatchFavorite(selectedTasks, !allSelectedFavorited)
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
