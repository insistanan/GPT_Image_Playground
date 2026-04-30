import type { TaskRecord } from '../types'
import { findCategoryById } from './domain'
import {
  buildTaskBatchMutationSelection,
  collectChangedTasks,
  persistTaskBatchMutation,
  updateMatchedTasks,
} from './taskBatchMutation'
import { applyTaskPurgePlan } from './taskPurgeApply'
import { planTaskPurge } from './taskPurgePlanner'
import { useStore } from './state'
import { isTaskInRecycleBin } from './taskRecords'

export interface GalleryTaskMutationResult {
  matchedTasks: TaskRecord[]
  changedTasks: TaskRecord[]
}

export interface GalleryTaskCategoryMutationResult extends GalleryTaskMutationResult {
  targetCategoryId: string | null
  targetCategoryName: string | null
}

export interface GalleryCategoryTaskRenameResult extends GalleryTaskMutationResult {
  categoryName: string
}

export async function assignGalleryTasksFavorite(
  tasksToUpdate: TaskRecord[],
  isFavorite: boolean,
): Promise<GalleryTaskMutationResult> {
  const selection = buildTaskBatchMutationSelection(tasksToUpdate)
  const { matchedTasks, matchedTaskIds } = selection
  const changedTaskIds = new Set(
    matchedTasks
      .filter((task) => Boolean(task.isFavorite) !== isFavorite)
      .map((task) => task.id),
  )

  if (!changedTaskIds.size) {
    return {
      matchedTasks,
      changedTasks: [],
    }
  }

  const updatedTasks = updateMatchedTasks(
    {
      ...selection,
      matchedTaskIds,
    },
    (task) =>
      changedTaskIds.has(task.id)
        ? {
            ...task,
            isFavorite,
          }
        : task,
  )
  const changedTasks = collectChangedTasks(updatedTasks, changedTaskIds)

  await persistTaskBatchMutation(updatedTasks, changedTasks)

  return {
    matchedTasks,
    changedTasks,
  }
}

export async function moveGalleryTasksToRecycleBin(
  tasksToRemove: TaskRecord[],
): Promise<GalleryTaskMutationResult> {
  const selection = buildTaskBatchMutationSelection(tasksToRemove, {
    predicate: (task) => !isTaskInRecycleBin(task),
  })
  const { matchedTasks, matchedTaskIds } = selection
  if (!matchedTasks.length) {
    return {
      matchedTasks,
      changedTasks: [],
    }
  }

  const deletedAt = Date.now()
  const updatedTasks = updateMatchedTasks(selection, (task) =>
    matchedTaskIds.has(task.id) ? { ...task, deletedAt } : task,
  )
  const changedTasks = collectChangedTasks(updatedTasks, matchedTaskIds)

  await persistTaskBatchMutation(updatedTasks, changedTasks, { clearSelection: true })

  return {
    matchedTasks,
    changedTasks,
  }
}

export async function restoreGalleryTasksFromRecycleBin(
  tasksToRestore: TaskRecord[],
): Promise<GalleryTaskMutationResult> {
  const selection = buildTaskBatchMutationSelection(tasksToRestore, {
    predicate: (task) => isTaskInRecycleBin(task),
  })
  const { matchedTasks, matchedTaskIds } = selection
  if (!matchedTasks.length) {
    return {
      matchedTasks,
      changedTasks: [],
    }
  }

  const updatedTasks = updateMatchedTasks(selection, (task) =>
    matchedTaskIds.has(task.id) ? { ...task, deletedAt: null } : task,
  )
  const changedTasks = collectChangedTasks(updatedTasks, matchedTaskIds)

  await persistTaskBatchMutation(updatedTasks, changedTasks, { clearSelection: true })

  return {
    matchedTasks,
    changedTasks,
  }
}

export async function moveGalleryTasksToCategory(
  tasksToMove: TaskRecord[],
  categoryId: string | null,
): Promise<GalleryTaskCategoryMutationResult> {
  const { categories } = useStore.getState()
  const targetCategory = categoryId ? findCategoryById(categories, categoryId) : undefined
  if (categoryId && !targetCategory) {
    throw new Error('目标分类不存在')
  }

  const selection = buildTaskBatchMutationSelection(tasksToMove)
  const { matchedTasks } = selection
  const nextCategoryId = targetCategory?.id ?? null
  const nextCategoryName = targetCategory?.name ?? null
  const changedTaskIds = new Set(
    matchedTasks
      .filter(
        (task) =>
          (task.categoryId ?? null) !== nextCategoryId ||
          (task.categoryName ?? null) !== nextCategoryName,
      )
      .map((task) => task.id),
  )

  if (!changedTaskIds.size) {
    return {
      matchedTasks,
      changedTasks: [],
      targetCategoryId: nextCategoryId,
      targetCategoryName: nextCategoryName,
    }
  }

  const updatedTasks = updateMatchedTasks(selection, (task) =>
    changedTaskIds.has(task.id)
      ? {
          ...task,
          categoryId: nextCategoryId,
          categoryName: nextCategoryName,
        }
      : task,
  )
  const changedTasks = collectChangedTasks(updatedTasks, changedTaskIds)

  await persistTaskBatchMutation(updatedTasks, changedTasks)

  return {
    matchedTasks,
    changedTasks,
    targetCategoryId: nextCategoryId,
    targetCategoryName: nextCategoryName,
  }
}

export async function renameGalleryCategoryTasks(
  categoryId: string,
  categoryName: string,
): Promise<GalleryCategoryTaskRenameResult> {
  const selection = buildTaskBatchMutationSelection(useStore.getState().tasks, {
    predicate: (task) => task.categoryId === categoryId,
  })
  const { matchedTasks, matchedTaskIds } = selection
  if (!matchedTasks.length) {
    return {
      matchedTasks,
      changedTasks: [],
      categoryName,
    }
  }

  const updatedTasks = updateMatchedTasks(selection, (task) =>
    matchedTaskIds.has(task.id)
      ? {
          ...task,
          categoryName,
        }
      : task,
  )
  const changedTasks = collectChangedTasks(updatedTasks, matchedTaskIds)

  await persistTaskBatchMutation(updatedTasks, changedTasks)

  return {
    matchedTasks,
    changedTasks,
    categoryName,
  }
}

export async function clearGalleryCategoryFromTasks(
  categoryId: string,
): Promise<GalleryTaskCategoryMutationResult> {
  const selection = buildTaskBatchMutationSelection(useStore.getState().tasks, {
    predicate: (task) => task.categoryId === categoryId,
  })
  const { matchedTasks, matchedTaskIds } = selection
  if (!matchedTasks.length) {
    return {
      matchedTasks,
      changedTasks: [],
      targetCategoryId: null,
      targetCategoryName: null,
    }
  }

  const updatedTasks = updateMatchedTasks(selection, (task) =>
    matchedTaskIds.has(task.id)
      ? {
          ...task,
          categoryId: null,
          categoryName: null,
        }
      : task,
  )
  const changedTasks = collectChangedTasks(updatedTasks, matchedTaskIds)

  await persistTaskBatchMutation(updatedTasks, changedTasks)

  return {
    matchedTasks,
    changedTasks,
    targetCategoryId: null,
    targetCategoryName: null,
  }
}

export async function purgeGalleryTasksPermanently(
  tasksToRemove: TaskRecord[],
): Promise<GalleryTaskMutationResult> {
  const { tasks, inputImages } = useStore.getState()
  const selection = buildTaskBatchMutationSelection(tasksToRemove)
  const { matchedTasks, matchedTaskIds } = selection

  if (!matchedTasks.length) {
    return {
      matchedTasks,
      changedTasks: [],
    }
  }

  const purgePlan = planTaskPurge({
    allTasks: tasks,
    taskIdsToDelete: Array.from(matchedTaskIds),
    inputImageIds: inputImages.map((image) => image.id),
  })
  await applyTaskPurgePlan(purgePlan)

  return {
    matchedTasks,
    changedTasks: matchedTasks,
  }
}
