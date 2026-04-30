import { deleteTask as dbDeleteTask } from '../lib/db'
import { deleteImageAsset } from './imageAssets'
import { useStore } from './state'
import { clearPurgedTaskUiState } from './taskStoreUtils'

export interface ApplyTaskPurgePlanInput {
  taskIdsToDelete: string[]
  imageIdsToDelete: string[]
}

async function deletePlannedImages(imageIds: string[]) {
  for (const imageId of imageIds) {
    await deleteImageAsset(imageId)
  }
}

export async function applyTaskPurgePlan(input: ApplyTaskPurgePlanInput) {
  if (!input.taskIdsToDelete.length) {
    return
  }

  const deletedTaskIds = new Set(input.taskIdsToDelete)
  const deletedImageIds = new Set(input.imageIdsToDelete)
  const { tasks, setTasks } = useStore.getState()
  const remainingTasks = tasks.filter((task) => !deletedTaskIds.has(task.id))

  setTasks(remainingTasks)
  clearPurgedTaskUiState(deletedTaskIds, deletedImageIds)
  await Promise.all(input.taskIdsToDelete.map((taskId) => dbDeleteTask(taskId)))
  await deletePlannedImages(input.imageIdsToDelete)
}
