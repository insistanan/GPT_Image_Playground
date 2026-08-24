import type { AppSettings, TaskErrorDebugInfo, TaskRecord } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import {
  clearTaskAbortState,
  isTaskAbortRequested,
  registerTaskAborter,
} from './taskAbort'
import type { TaskApiOutputImageAsset } from './taskApiRequest'
import { callTaskImageApi } from './taskApiRequest'
import type { StoreApiError } from './contracts'
import { isRecord } from '../lib/guards'
import { isUserAbortLikeError } from '../lib/api/abort'
import { evictImage, storeImage } from './imageAssets'
import { useStore } from './state'
import {
  abortTaskRun,
  appendTaskRunOutputs,
  failTaskRun,
  succeedTaskRun,
} from './taskRun'

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

export async function executeTask(taskId: string, requestSettings: AppSettings) {
  const task = useStore.getState().tasks.find((item) => item.id === taskId)
  if (!task) {
    return
  }

  const outputIds: string[] = []

  try {
    throwIfTaskAbortRequested(taskId)

    const appendOutputImages = async (images: TaskApiOutputImageAsset[]) => {
      if (!images.length) {
        return
      }

      for (const image of images) {
        throwIfTaskAbortRequested(taskId)
        const imageId = await storeImage(image.blob, {
          source: 'generated',
          mimeType: image.mimeType || image.blob.type || null,
        })
        throwIfTaskAbortRequested(taskId)
        outputIds.push(imageId)
      }

      appendTaskRunOutputs(taskId, outputIds)
    }

    throwIfTaskAbortRequested(taskId)
    const result = await callTaskImageApi(task, requestSettings, {
      onFinalImages: appendOutputImages,
      registerAbort: (abort) => {
        registerTaskAborter(taskId, abort)
      },
      throwIfAborted: () => throwIfTaskAbortRequested(taskId),
    })

    throwIfTaskAbortRequested(taskId)
    if (outputIds.length < result.images.length) {
      await appendOutputImages(result.images.slice(outputIds.length))
    }

    throwIfTaskAbortRequested(taskId)
    succeedTaskRun(taskId, {
      outputImageIds: outputIds,
      responseMeta: result.responseMeta ?? null,
    })

    useStore.getState().showToast(`生成完成，共 ${outputIds.length} 张图片`, 'success')
  } catch (error) {
    // 用户中止的判定：标记位（检查点抛错）或类型化 AbortError。
    // 超时 abort 带 timeout 标记，不算用户中止，走正常失败分支展示原因。
    const wasUserAborted = isTaskAbortRequested(taskId) || isUserAbortLikeError(error)
    if (wasUserAborted) {
      abortTaskRun(taskId, outputIds)
      return
    }

    failTaskRun(taskId, {
      outputImageIds: outputIds,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorDebug: buildTaskErrorDebugInfo(requestSettings, error),
    })
    useStore.getState().setDetailTaskId(taskId)
  } finally {
    clearTaskAbortState(taskId)
    for (const imageId of task.inputImageIds) {
      evictImage(imageId)
    }
  }
}
