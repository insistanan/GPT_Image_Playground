import { putTask } from '../lib/db'
import type { TaskErrorDebugInfo, TaskRecord, TaskResponseMeta } from '../types'
import { getTaskAborter, requestTaskAbort } from './taskAbort'
import { useStore } from './state'
import { resolveTaskAbortPlan, resolveTaskRetryPlan } from './taskRecords'
import { updateTaskInStore } from './taskStoreUtils'

export interface EnqueueTaskRunOptions {
  focusDetail?: boolean
}

export type RetryTaskRunResult =
  | {
      ok: false
      message: string
      toastType: 'info' | 'error'
    }
  | {
      ok: true
      task: TaskRecord
      message: string
    }

export type RequestAbortTaskRunResult =
  | {
      ok: false
      message: string
      toastType: 'info' | 'error'
    }
  | {
      ok: true
      message: string
    }

export interface TaskRunSuccessResult {
  outputImageIds: string[]
  responseMeta?: TaskResponseMeta | null
}

export interface TaskRunFailure {
  outputImageIds: string[]
  errorMessage: string
  errorDebug: TaskErrorDebugInfo
}

export async function enqueueTaskRun(
  task: TaskRecord,
  options?: EnqueueTaskRunOptions,
) {
  const { tasks, setTasks, setDetailTaskId } = useStore.getState()
  setTasks([task, ...tasks])
  await putTask(task)

  if (options?.focusDetail) {
    setDetailTaskId(task.id)
  }
}

export async function retryTaskRun(task: TaskRecord): Promise<RetryTaskRunResult> {
  const retryPlan = resolveTaskRetryPlan(task)

  if (retryPlan.action === 'blocked') {
    return {
      ok: false,
      message: retryPlan.message,
      toastType: retryPlan.toastType,
    }
  }

  if (retryPlan.action === 'clone') {
    await enqueueTaskRun(retryPlan.task, { focusDetail: true })
    return {
      ok: true,
      task: retryPlan.task,
      message: retryPlan.message,
    }
  }

  restartTaskRun(task.id)
  return {
    ok: true,
    task,
    message: retryPlan.message,
  }
}

export function requestAbortTaskRun(task: TaskRecord): RequestAbortTaskRunResult {
  // 不信任调用方传入的任务快照：中止判定必须基于 store 实时状态。
  // 检查与标记写入都在同一同步块内完成，避免与任务正常结束的清理逻辑产生竞态，
  // 否则可能残留 userAbortedTaskIds 标记，导致该任务后续重试永远立即失败。
  const liveTask = useStore.getState().tasks.find((item) => item.id === task.id) ?? task
  const abortPlan = resolveTaskAbortPlan(liveTask)

  if (abortPlan.action === 'blocked') {
    return {
      ok: false,
      message: abortPlan.message,
      toastType: abortPlan.toastType,
    }
  }

  requestTaskAbort(liveTask.id)
  getTaskAborter(liveTask.id)?.()

  return {
    ok: true,
    message: abortPlan.message,
  }
}

export function restartTaskRun(taskId: string) {
  updateTaskInStore(taskId, {
    status: 'running',
    isAborted: false,
    error: null,
    errorDebug: null,
    outputImages: [],
    responseMeta: null,
    finishedAt: null,
    elapsed: null,
    createdAt: Date.now(),
  })
}

export function appendTaskRunOutputs(taskId: string, outputImageIds: string[]) {
  updateTaskInStore(taskId, {
    outputImages: [...outputImageIds],
  })
}

export function succeedTaskRun(taskId: string, result: TaskRunSuccessResult) {
  const task = useStore.getState().tasks.find((item) => item.id === taskId)
  if (!task) {
    return
  }

  const finishedAt = Date.now()
  updateTaskInStore(taskId, {
    outputImages: [...result.outputImageIds],
    responseMeta: result.responseMeta ?? null,
    isAborted: false,
    error: null,
    errorDebug: null,
    status: 'done',
    finishedAt,
    elapsed: finishedAt - task.createdAt,
  })
}

export function abortTaskRun(taskId: string, outputImageIds: string[]) {
  const task = useStore.getState().tasks.find((item) => item.id === taskId)
  if (!task) {
    return
  }

  const finishedAt = Date.now()
  updateTaskInStore(taskId, {
    outputImages: [...outputImageIds],
    status: outputImageIds.length > 0 ? 'partial_error' : 'error',
    isAborted: true,
    error: '任务已中止',
    errorDebug: null,
    finishedAt,
    elapsed: finishedAt - task.createdAt,
  })
}

export function failTaskRun(taskId: string, failure: TaskRunFailure) {
  const task = useStore.getState().tasks.find((item) => item.id === taskId)
  if (!task) {
    return
  }

  const finishedAt = Date.now()
  updateTaskInStore(taskId, {
    outputImages: [...failure.outputImageIds],
    status: failure.outputImageIds.length > 0 ? 'partial_error' : 'error',
    isAborted: false,
    error: failure.errorMessage,
    errorDebug: failure.errorDebug,
    finishedAt,
    elapsed: finishedAt - task.createdAt,
  })
}
