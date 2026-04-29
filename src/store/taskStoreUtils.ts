import { putTask } from '../lib/db'
import type { InputImage, TaskRecord } from '../types'
import { useStore } from './state'
import {
  getTaskReferencedImageIds,
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

export function collectReferencedImageIds(tasks: TaskRecord[], inputImages: InputImage[]): Set<string> {
  const referenced = new Set<string>()
  for (const task of tasks) {
    for (const id of getTaskReferencedImageIds(task)) {
      referenced.add(id)
    }
  }
  for (const image of inputImages) {
    referenced.add(image.id)
  }
  return referenced
}

export function clearTaskUiState(taskIds: Set<string>) {
  useStore.setState((state) => ({
    selectedTaskIds: state.selectedTaskIds.filter((id) => !taskIds.has(id)),
    detailTaskId:
      state.detailTaskId && taskIds.has(state.detailTaskId) ? null : state.detailTaskId,
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
