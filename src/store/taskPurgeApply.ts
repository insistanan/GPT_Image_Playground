import { STORE_IMAGES, STORE_TASKS, writeDbBatch } from '@/lib/db/schema'
import { evictImage } from './imageAssets'
import { useStore } from './state'
import { clearPurgedTaskUiState } from './taskStoreUtils'
import { getTaskAborter, requestTaskAbort } from './taskAbort'

export interface ApplyTaskPurgePlanInput {
  taskIdsToDelete: string[]
  imageIdsToDelete: string[]
}

export async function applyTaskPurgePlan(input: ApplyTaskPurgePlanInput) {
  if (!input.taskIdsToDelete.length) {
    return
  }

  const deletedTaskIds = new Set(input.taskIdsToDelete)
  const deletedImageIds = new Set(input.imageIdsToDelete)
  for (const taskId of deletedTaskIds) {
    if (!useStore.getState().tasks.some((task) => task.id === taskId && task.status === 'running')) continue
    requestTaskAbort(taskId)
    getTaskAborter(taskId)?.()
  }
  await writeDbBatch([STORE_TASKS, STORE_IMAGES], (transaction) => {
    for (const taskId of deletedTaskIds) transaction.objectStore(STORE_TASKS).delete(taskId)
    for (const imageId of deletedImageIds) transaction.objectStore(STORE_IMAGES).delete(imageId)
  })
  const { tasks, setTasks } = useStore.getState()
  setTasks(tasks.filter((task) => !deletedTaskIds.has(task.id)))
  clearPurgedTaskUiState(deletedTaskIds, deletedImageIds)
  for (const imageId of deletedImageIds) evictImage(imageId)
}
