const runningTaskAborters = new Map<string, () => void>()
const userAbortedTaskIds = new Set<string>()

export function registerTaskAborter(taskId: string, abort: () => void) {
  runningTaskAborters.set(taskId, abort)

  // 中止请求可能发生在 aborter 注册之前（此时 getTaskAborter 落空），
  // 注册完成后必须回查标记并立即补发 abort，否则请求会在已请求中止的情况下照常发出。
  if (userAbortedTaskIds.has(taskId)) {
    abort()
  }
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
