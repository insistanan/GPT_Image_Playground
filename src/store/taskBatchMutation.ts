import { putTask } from '../lib/db'
import type { TaskRecord } from '../types'
import { useStore } from './state'
import { clearTaskUiState } from './taskStoreUtils'

export interface TaskBatchMutationSelection {
  allTasks: TaskRecord[]
  matchedTasks: TaskRecord[]
  matchedTaskIds: Set<string>
}

export interface ApplyTaskBatchMutationOptions {
  clearSelection?: boolean
}

export function buildTaskBatchMutationSelection(
  tasksToMatch: TaskRecord[],
  options?: {
    predicate?: (task: TaskRecord) => boolean
  },
): TaskBatchMutationSelection {
  const allTasks = useStore.getState().tasks
  const requestedTaskIds = new Set(tasksToMatch.map((task) => task.id))
  const matchedTasks = allTasks.filter(
    (task) => requestedTaskIds.has(task.id) && (options?.predicate ? options.predicate(task) : true),
  )

  return {
    allTasks,
    matchedTasks,
    matchedTaskIds: new Set(matchedTasks.map((task) => task.id)),
  }
}

export function updateMatchedTasks(
  selection: TaskBatchMutationSelection,
  mutate: (task: TaskRecord) => TaskRecord,
): TaskRecord[] {
  if (!selection.matchedTaskIds.size) {
    return selection.allTasks
  }

  return selection.allTasks.map((task) =>
    selection.matchedTaskIds.has(task.id) ? mutate(task) : task,
  )
}

export function collectChangedTasks(
  tasks: TaskRecord[],
  taskIds: Set<string>,
): TaskRecord[] {
  return tasks.filter((task) => taskIds.has(task.id))
}

export async function persistTaskBatchMutation(
  updatedTasks: TaskRecord[],
  changedTasks: TaskRecord[],
  options?: ApplyTaskBatchMutationOptions,
) {
  useStore.getState().setTasks(updatedTasks)

  if (options?.clearSelection && changedTasks.length > 0) {
    clearTaskUiState(new Set(changedTasks.map((task) => task.id)))
  }

  await Promise.all(changedTasks.map((task) => putTask(task)))
}
