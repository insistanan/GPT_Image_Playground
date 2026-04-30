import { putTask } from '../lib/db'
import type { TaskRecord } from '../types'
import { useStore } from './state'
import {
  mergeCategoriesFromTasks,
  resolveActiveCategoryFilter,
} from './domain'

export function updateTaskInStore(taskId: string, patch: Partial<TaskRecord>) {
  const { tasks, setTasks } = useStore.getState()
  const updatedTasks = tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task))
  setTasks(updatedTasks)
  const updatedTask = updatedTasks.find((task) => task.id === taskId)
  if (updatedTask) {
    void putTask(updatedTask)
  }
}

export function clearTaskUiState(taskIds: Set<string>) {
  useStore.setState((state) => ({
    selectedTaskIds: state.selectedTaskIds.filter((id) => !taskIds.has(id)),
    detailTaskId:
      state.detailTaskId && taskIds.has(state.detailTaskId) ? null : state.detailTaskId,
  }))
}

export function clearPurgedTaskUiState(taskIds: Set<string>, deletedImageIds: Set<string>) {
  clearTaskUiState(taskIds)
  useStore.setState((state) => ({
    imageEditSession:
      state.imageEditSession == null
        ? null
        : deletedImageIds.has(state.imageEditSession.sourceImageId)
          ? null
          : {
              ...state.imageEditSession,
              sourceImageIds: state.imageEditSession.sourceImageIds?.filter(
                (imageId) => !deletedImageIds.has(imageId),
              ) ?? state.imageEditSession.sourceImageIds,
            },
    lightboxImageId:
      state.lightboxImageId && deletedImageIds.has(state.lightboxImageId)
        ? null
        : state.lightboxImageId,
    lightboxImageList: state.lightboxImageList.filter((imageId) => !deletedImageIds.has(imageId)),
  }))
}

export function repairCategoryStateFromTasks(tasks: TaskRecord[]) {
  const { categories, activeCategoryFilter } = useStore.getState()
  const nextCategories = mergeCategoriesFromTasks(categories, tasks)
  const hasChanged =
    nextCategories.length !== categories.length ||
    nextCategories.some(
      (category, index) =>
        categories[index]?.id !== category.id ||
        categories[index]?.name !== category.name ||
        categories[index]?.createdAt !== category.createdAt,
    )

  if (!hasChanged) {
    return
  }

  useStore.setState({
    categories: nextCategories,
    activeCategoryFilter: resolveActiveCategoryFilter(activeCategoryFilter, nextCategories),
  })
}
