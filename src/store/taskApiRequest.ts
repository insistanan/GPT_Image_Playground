import { callImageApi } from '../lib/api'
import type { ApiInputImage, ApiImageAsset, CallApiResult } from '../lib/api'
import type { AppSettings, TaskRecord } from '../types'
import { ensureImageAssetDataUrl } from './imageAssets'

export type TaskApiOutputImageAsset = ApiImageAsset

export interface TaskApiRequestHandlers {
  onFinalImages?: (images: TaskApiOutputImageAsset[]) => void | Promise<void>
  registerAbort?: (abort: () => void) => void
  throwIfAborted?: () => void
}

async function loadTaskInputImages(
  task: TaskRecord,
  throwIfAborted?: () => void,
) {
  const inputImages: ApiInputImage[] = []

  for (const imageId of task.inputImageIds) {
    throwIfAborted?.()
    const dataUrl = await ensureImageAssetDataUrl(imageId)
    throwIfAborted?.()
    if (!dataUrl) {
      continue
    }

    inputImages.push({
      id: imageId,
      dataUrl,
    })
  }

  return inputImages
}

async function loadTaskEditMaskDataUrl(
  task: TaskRecord,
  throwIfAborted?: () => void,
): Promise<string | undefined> {
  if (!task.editMaskImageId) {
    return undefined
  }

  throwIfAborted?.()
  const editMaskDataUrl = await ensureImageAssetDataUrl(task.editMaskImageId)
  throwIfAborted?.()
  if (!editMaskDataUrl) {
    throw new Error('局部编辑蒙版缺失，请重新选择编辑区域后再试')
  }

  return editMaskDataUrl
}

export async function callTaskImageApi(
  task: TaskRecord,
  settings: AppSettings,
  handlers: TaskApiRequestHandlers = {},
): Promise<CallApiResult> {
  const inputImages = await loadTaskInputImages(
    task,
    handlers.throwIfAborted,
  )
  const editMaskDataUrl = await loadTaskEditMaskDataUrl(task, handlers.throwIfAborted)
  handlers.throwIfAborted?.()

  return callImageApi({
    settings,
    prompt: task.prompt,
    params: task.params,
    inputImages,
    editMask: editMaskDataUrl
      ? {
          dataUrl: editMaskDataUrl,
          sourceImageId: task.editSourceImageId ?? null,
          selection: task.editSelection ?? null,
        }
      : null,
    onFinalImages: handlers.onFinalImages,
    registerAbort: handlers.registerAbort,
  })
}
