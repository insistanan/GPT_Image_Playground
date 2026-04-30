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
  const abortPlan = resolveTaskAbortPlan(task)

  if (abortPlan.action === 'blocked') {
    return {
      ok: false,
      message: abortPlan.message,
      toastType: abortPlan.toastType,
    }
  }

  requestTaskAbort(task.id)
  getTaskAborter(task.id)?.()

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
