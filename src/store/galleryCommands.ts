import type { TaskRecord } from '../types'
import { UNCATEGORIZED_CATEGORY_FILTER } from '../types'
import { findCategoryById } from './domain'
import { editOutputs } from './imageEditActions'
import {
  createCategory,
  deleteCategory,
  moveTaskToCategory,
  moveTasksToCategory,
  purgeTask,
  purgeTasks,
  renameCategory,
  removeTask,
  removeTasks,
  restoreTask,
  restoreTasks,
  reuseConfig,
  setTasksFavorite,
  toggleTaskFavorite,
} from './collectionActions'
import { abortTask, retryTask } from './runtime'
import { useStore } from './state'

interface ConfirmDialogPayload {
  title: string
  message: string
  confirmText?: string
  action: () => void | Promise<void>
}

function showConfirmDialog(payload: ConfirmDialogPayload) {
  useStore.getState().setConfirmDialog(payload)
}

function showErrorToast(error: unknown) {
  useStore
    .getState()
    .showToast(error instanceof Error ? error.message : String(error), 'error')
}

function normalizeCategoryTarget(categoryTarget: string): string | null {
  return categoryTarget === UNCATEGORIZED_CATEGORY_FILTER ? null : categoryTarget
}

export function runGalleryReuse(task: TaskRecord) {
  void reuseConfig(task)
}

export function runGalleryEditOutputs(task: TaskRecord, preferredImageId?: string) {
  void editOutputs(task, preferredImageId)
}

export function runGalleryRetry(task: TaskRecord) {
  void retryTask(task)
}

export function runGalleryAbort(task: TaskRecord) {
  showConfirmDialog({
    title: '确认中止生成',
    message: '确定要中止这个正在生成的任务吗？已生成的图片会保留，任务会标记为已中止。',
    confirmText: '确认中止',
    action: () => {
      void abortTask(task)
    },
  })
}

export function runGalleryToggleFavorite(task: TaskRecord) {
  void toggleTaskFavorite(task)
}

export async function runGalleryBatchFavorite(tasks: TaskRecord[], nextFavorite: boolean) {
  if (!tasks.length) {
    return
  }

  await setTasksFavorite(tasks, nextFavorite)
}

export async function runGalleryMoveTaskToCategory(task: TaskRecord, categoryTarget: string) {
  try {
    await moveTaskToCategory(task, normalizeCategoryTarget(categoryTarget))
  } catch (error) {
    showErrorToast(error)
  }
}

export async function runGalleryBatchMoveToCategory(tasks: TaskRecord[], categoryTarget: string) {
  if (!tasks.length) {
    return
  }

  try {
    await moveTasksToCategory(tasks, normalizeCategoryTarget(categoryTarget))
  } catch (error) {
    showErrorToast(error)
  }
}

export function runGalleryCreateCategory(name: string): boolean {
  try {
    createCategory(name)
    return true
  } catch (error) {
    showErrorToast(error)
    return false
  }
}

export async function runGalleryRenameCategory(categoryId: string, name: string): Promise<boolean> {
  try {
    await renameCategory(categoryId, name)
    return true
  } catch (error) {
    showErrorToast(error)
    return false
  }
}

export function confirmGalleryDeleteCategory(categoryId: string) {
  const { categories } = useStore.getState()
  const category = findCategoryById(categories, categoryId)
  if (!category) {
    showErrorToast(new Error('分类不存在'))
    return
  }

  showConfirmDialog({
    title: '删除分类',
    message: `确定删除分类「${category.name}」吗？该分类下的项目会移入未分类。`,
    confirmText: '删除分类',
    action: async () => {
      try {
        await deleteCategory(categoryId)
      } catch (error) {
        showErrorToast(error)
      }
    },
  })
}

export function confirmGalleryRemoveTask(task: TaskRecord) {
  showConfirmDialog({
    title: '移入回收站',
    message: '确定要将这条记录移入回收站吗？提示词、配置和图片会暂时保留，可在回收站恢复。',
    confirmText: '移入回收站',
    action: () => removeTask(task),
  })
}

export function confirmGalleryBatchRemoveTasks(tasks: TaskRecord[]) {
  if (!tasks.length) {
    return
  }

  showConfirmDialog({
    title: '批量移入回收站',
    message: `确定要将选中的 ${tasks.length} 条记录移入回收站吗？提示词、配置和图片会暂时保留，可在回收站恢复。`,
    confirmText: '移入回收站',
    action: () => removeTasks(tasks),
  })
}

export function confirmGalleryRestoreTask(task: TaskRecord) {
  showConfirmDialog({
    title: '恢复记录',
    message: '确定要将这条记录恢复到画廊吗？',
    confirmText: '恢复',
    action: () => restoreTask(task),
  })
}

export function confirmGalleryBatchRestoreTasks(tasks: TaskRecord[]) {
  if (!tasks.length) {
    return
  }

  showConfirmDialog({
    title: '批量恢复记录',
    message: `确定要恢复选中的 ${tasks.length} 条记录吗？`,
    confirmText: '恢复',
    action: () => restoreTasks(tasks),
  })
}

export function confirmGalleryPurgeTask(task: TaskRecord) {
  showConfirmDialog({
    title: '彻底删除记录',
    message: '确定要彻底删除这条记录吗？删除后将无法恢复，并会清理未被其他任务引用的图片。',
    confirmText: '彻底删除',
    action: async () => {
      await purgeTask(task)
    },
  })
}

export function confirmGalleryBatchPurgeTasks(tasks: TaskRecord[]) {
  if (!tasks.length) {
    return
  }

  showConfirmDialog({
    title: '批量彻底删除',
    message: `确定要彻底删除选中的 ${tasks.length} 条记录吗？删除后将无法恢复，并会清理未被其他任务引用的图片。`,
    confirmText: '彻底删除',
    action: async () => {
      await purgeTasks(tasks)
    },
  })
}

export function confirmGalleryClearFailedTasks(tasks: TaskRecord[]) {
  if (!tasks.length) {
    return
  }

  showConfirmDialog({
    title: '清理失败项目',
    message: `确定将全部 ${tasks.length} 条失败项目移入回收站吗？它们的提示词、配置和图片会暂时保留，可在回收站恢复。`,
    confirmText: '移入回收站',
    action: () => removeTasks(tasks),
  })
}

export function openGalleryMoveCategoryDialog(task: TaskRecord): {
  task: TaskRecord
  targetCategory: string
} {
  const { categories } = useStore.getState()
  const targetCategory =
    task.categoryId && findCategoryById(categories, task.categoryId)
      ? task.categoryId
      : UNCATEGORIZED_CATEGORY_FILTER

  return {
    task,
    targetCategory,
  }
}

export function openGalleryTaskDetail(taskId: string) {
  useStore.getState().setDetailTaskId(taskId)
}

export function applyGalleryTaskDetailAction(
  action: 'reuse' | 'retry' | 'favorite' | 'remove' | 'restore' | 'purge',
  task: TaskRecord,
) {
  switch (action) {
    case 'reuse':
      void reuseConfig(task)
      return
    case 'retry':
      void retryTask(task)
      return
    case 'favorite':
      void toggleTaskFavorite(task)
      return
    case 'remove':
      confirmGalleryRemoveTask(task)
      return
    case 'restore':
      confirmGalleryRestoreTask(task)
      return
    case 'purge':
      confirmGalleryPurgeTask(task)
      return
  }
}
