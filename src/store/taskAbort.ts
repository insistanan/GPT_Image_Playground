const runningTaskAborters = new Map<string, () => void>()
const userAbortedTaskIds = new Set<string>()

export function registerTaskAborter(taskId: string, abort: () => void) {
  runningTaskAborters.set(taskId, abort)
}

export function getTaskAborter(taskId: string): (() => void) | undefined {
  return runningTaskAborters.get(taskId)
}

export function requestTaskAbort(taskId: string) {
  userAbortedTaskIds.add(taskId)
}

export function isTaskAbortRequested(taskId: string): boolean {
  return userAbortedTaskIds.has(taskId)
}

export function clearTaskAbortState(taskId: string) {
  runningTaskAborters.delete(taskId)
  userAbortedTaskIds.delete(taskId)
}
