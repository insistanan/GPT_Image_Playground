import type { AppSettings, TaskErrorDebugInfo, TaskRecord } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import {
  clearTaskAbortState,
  isTaskAbortRequested,
  registerTaskAborter,
  getTaskAborter,
  requestTaskAbort,
} from './taskAbort'
import type { TaskApiOutputImageAsset } from './taskApiRequest'
import { callTaskImageApi } from './taskApiRequest'
import type { StoreApiError } from './contracts'
import { isRecord } from '@/lib/guards'
import { isUserAbortLikeError } from '@/lib/api/abort'
import { evictImage, storeImage } from './imageAssets'
import { useStore } from './state'
import { clearTaskPartialPreview, setTaskPartialPreview } from './taskPartialPreviews'
import {
  abortTaskRun,
  appendTaskRunOutputs,
  failTaskRun,
  succeedTaskRun,
} from './taskRun'
import { assertDataVersion, DataResetError, getDataVersion, withDataMutation } from './dataMutation'

const activeExecutions = new Set<string>()

export function isTaskExecutionActive(taskId: string): boolean {
  return activeExecutions.has(taskId)
}

export function cancelAllTaskExecutions() {
  for (const taskId of activeExecutions) {
    requestTaskAbort(taskId)
    getTaskAborter(taskId)?.()
  }
}

function readLocalDebugFromErrorDetails(details: unknown): TaskErrorDebugInfo | null {
  if (!isRecord(details)) {
    return null
  }

  return isRecord(details.localDebug) ? (details.localDebug as TaskErrorDebugInfo) : null
}

function buildTaskErrorDebugInfo(
  requestSettings: AppSettings,
  error: unknown,
): TaskErrorDebugInfo {
  const apiError = (error instanceof Error ? error : new Error(String(error))) as StoreApiError
  const localDebug = readLocalDebugFromErrorDetails(apiError.details)
  if (localDebug) {
    return localDebug
  }

  const debugInfo: TaskErrorDebugInfo = {
    createdAt: Date.now(),
    requestId: apiError.requestId || null,
    status: typeof apiError.status === 'number' ? apiError.status : null,
    requestMode: requestSettings.requestMode || DEFAULT_SETTINGS.requestMode,
    apiProtocol: requestSettings.apiProtocol || DEFAULT_SETTINGS.apiProtocol,
    baseUrl: requestSettings.baseUrl,
    model: requestSettings.model,
    responsesImageModel: requestSettings.responsesImageModel || null,
    responsesTransport: requestSettings.responsesTransport || null,
    responsesImageInputMode: requestSettings.responsesImageInputMode || null,
    responsesPromptRevisionMode: requestSettings.responsesPromptRevisionMode || null,
  }

  if (apiError.details !== undefined) {
    debugInfo.details = apiError.details
  }

  return debugInfo
}

function throwIfTaskAbortRequested(taskId: string) {
  if (!isTaskAbortRequested(taskId)) {
    return
  }

  const error = new Error('任务已中止')
  error.name = 'TaskAbortError'
  throw error
}

export async function executeTask(taskId: string, requestSettings: AppSettings, version = getDataVersion()) {
  if (isTaskExecutionActive(taskId)) {
    useStore.getState().showToast('该任务已有正在执行的请求', 'error')
    return
  }
  const task = useStore.getState().tasks.find((item) => item.id === taskId)
  if (!task) {
    return
  }

  const outputIds: string[] = []
  const savedBlobs = new WeakSet<Blob>()
  activeExecutions.add(taskId)
  const assertActive = () => {
    assertDataVersion(version)
    if (!useStore.getState().tasks.some((item) => item.id === taskId)) throw new DataResetError()
    throwIfTaskAbortRequested(taskId)
  }

  try {
    assertActive()

    const appendOutputImages = async (images: TaskApiOutputImageAsset[]) => {
      if (!images.length) {
        return
      }

      for (const image of images) {
        await withDataMutation(async () => {
          assertActive()
          if (savedBlobs.has(image.blob)) return
          const imageId = await storeImage(image.blob, {
            source: 'generated',
            mimeType: image.mimeType || image.blob.type || null,
          })
          // 图片已写入后先保存引用，即使此刻用户要求中止也保留该结果。
          outputIds.push(imageId)
          savedBlobs.add(image.blob)
          await appendTaskRunOutputs(taskId, outputIds)
        }, version)
      }
    }

    assertActive()
    const result = await callTaskImageApi(task, requestSettings, {
      onFinalImages: appendOutputImages,
      onPartialImage: (partial) => {
        assertActive()
        setTaskPartialPreview(taskId, partial.blob)
      },
      registerAbort: (abort) => {
        registerTaskAborter(taskId, abort)
      },
      throwIfAborted: assertActive,
    })

    assertActive()
    await appendOutputImages(result.images)
    if (outputIds.length < task.params.n) {
      throw new Error(`请求 ${task.params.n} 张图片，仅收到 ${outputIds.length} 张，已保留完成的结果`)
    }

    await withDataMutation(async () => {
      assertActive()
      await succeedTaskRun(taskId, {
        outputImageIds: outputIds,
        responseMeta: result.responseMeta ?? null,
      })
    }, version)

    useStore.getState().showToast(`生成完成，共 ${outputIds.length} 张图片`, 'success')
  } catch (error) {
    if (error instanceof DataResetError || version !== getDataVersion()) return
    // 用户中止的判定：标记位（检查点抛错）或类型化 AbortError。
    // 超时 abort 带 timeout 标记，不算用户中止，走正常失败分支展示原因。
    const wasUserAborted = isTaskAbortRequested(taskId) || isUserAbortLikeError(error)
    try {
      await withDataMutation(async () => {
        if (!useStore.getState().tasks.some((item) => item.id === taskId)) return
        if (wasUserAborted) {
          await abortTaskRun(taskId, outputIds)
        } else {
          await failTaskRun(taskId, {
            outputImageIds: outputIds,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorDebug: buildTaskErrorDebugInfo(requestSettings, error),
          })
          useStore.getState().setDetailTaskId(taskId)
        }
      }, version)
    } catch (saveError) {
      if (saveError instanceof DataResetError) return
      const message = `任务结果保存失败：${saveError instanceof Error ? saveError.message : String(saveError)}`
      const { tasks, setTasks, showToast } = useStore.getState()
      setTasks(tasks.map((item) => item.id === taskId ? {
        ...item,
        outputImages: [...outputIds],
        status: outputIds.length ? 'partial_error' : 'error',
        error: message,
        finishedAt: Date.now(),
      } : item))
      showToast(message, 'error')
      console.error(message, { error, saveError })
    }
  } finally {
    activeExecutions.delete(taskId)
    clearTaskAbortState(taskId)
    clearTaskPartialPreview(taskId)
    for (const imageId of task.inputImageIds) {
      evictImage(imageId)
    }
  }
}
