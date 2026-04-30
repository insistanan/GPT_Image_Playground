import type { TaskRecord } from '../types'
import { getTaskReferencedImageIds } from './domain'

export interface TaskPurgePlanInput {
  allTasks: TaskRecord[]
  taskIdsToDelete: string[]
  inputImageIds: string[]
}

export interface OrphanImageCleanupPlanInput {
  allTasks: TaskRecord[]
  allImageIds: string[]
  inputImageIds: string[]
}

export interface TaskPurgePlan {
  taskIdsToDelete: string[]
  imageIdsToDelete: string[]
}

function collectLiveImageIds(tasks: TaskRecord[], inputImageIds: string[]): Set<string> {
  const liveImageIds = new Set<string>()

  for (const task of tasks) {
    for (const imageId of getTaskReferencedImageIds(task)) {
      liveImageIds.add(imageId)
    }
  }

  for (const imageId of inputImageIds) {
    liveImageIds.add(imageId)
  }

  return liveImageIds
}

export function planTaskPurge(input: TaskPurgePlanInput): TaskPurgePlan {
  const targetTaskIdSet = new Set(input.taskIdsToDelete)
  const matchedTasks = input.allTasks.filter((task) => targetTaskIdSet.has(task.id))
  const matchedTaskIds = matchedTasks.map((task) => task.id)

  if (!matchedTaskIds.length) {
    return {
      taskIdsToDelete: [],
      imageIdsToDelete: [],
    }
  }

  const referencedByDeletedTasks = new Set<string>()
  for (const task of matchedTasks) {
    for (const imageId of getTaskReferencedImageIds(task)) {
      referencedByDeletedTasks.add(imageId)
    }
  }

  const remainingTasks = input.allTasks.filter((task) => !targetTaskIdSet.has(task.id))
  const liveImageIds = collectLiveImageIds(remainingTasks, input.inputImageIds)
  const imageIdsToDelete = Array.from(referencedByDeletedTasks).filter(
    (imageId) => !liveImageIds.has(imageId),
  )

  return {
    taskIdsToDelete: matchedTaskIds,
    imageIdsToDelete,
  }
}

export function planOrphanImageCleanup(input: OrphanImageCleanupPlanInput): TaskPurgePlan {
  const liveImageIds = collectLiveImageIds(input.allTasks, input.inputImageIds)

  return {
    taskIdsToDelete: [],
    imageIdsToDelete: input.allImageIds.filter((imageId) => !liveImageIds.has(imageId)),
  }
}
