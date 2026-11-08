import { callImageApi } from '@/lib/api'
import type { ApiInputImage, ApiImageAsset, ApiPartialImage, CallApiResult } from '@/lib/api'
import type { AppSettings, TaskRecord } from '@/types'
import { getImageView } from './imageAssets'

export type TaskApiOutputImageAsset = ApiImageAsset

export interface TaskApiRequestHandlers {
  onFinalImages?: (images: TaskApiOutputImageAsset[]) => void | Promise<void>
  onPartialImage?: (partial: ApiPartialImage) => void | Promise<void>
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
    const dataUrl = await getImageView(imageId).getRawDataUrl()
    throwIfAborted?.()
    if (!dataUrl) {
      throw new Error(`参考图缺失（${imageId}），请恢复图片或重新选择参考图后再提交`)
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
  const editMaskDataUrl = await getImageView(task.editMaskImageId).getRawDataUrl()
  throwIfAborted?.()
  if (!editMaskDataUrl) {
    throw new Error('局部编辑蒙版缺失，请重新选择编辑区域后再试')
  }

  return editMaskDataUrl
}

async function loadTaskEditMarkupDataUrl(
  task: TaskRecord,
  throwIfAborted?: () => void,
): Promise<string | undefined> {
  if (!task.editMarkupImageId) {
    return undefined
  }

  throwIfAborted?.()
  const editMarkupDataUrl = await getImageView(task.editMarkupImageId).getRawDataUrl()
  throwIfAborted?.()
  if (!editMarkupDataUrl) {
    throw new Error('局部编辑标注缺失，请重新绘制标注后再试')
  }

  return editMarkupDataUrl
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
  const editMarkupDataUrl = await loadTaskEditMarkupDataUrl(task, handlers.throwIfAborted)
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
    editMarkup: editMarkupDataUrl
      ? {
          dataUrl: editMarkupDataUrl,
        }
      : null,
    onFinalImages: handlers.onFinalImages,
    onPartialImage: handlers.onPartialImage,
    registerAbort: handlers.registerAbort,
  })
}
