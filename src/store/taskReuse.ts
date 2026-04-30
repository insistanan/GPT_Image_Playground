import type { InputImage, TaskRecord } from '../types'
import { ensureImageAssetDataUrl } from './imageAssets'
import { resolveTaskKind } from './taskRecords'

function resolveReusableTaskImageIds(task: TaskRecord): string[] {
  if (task.inputImageIds.length > 0) {
    return task.inputImageIds
  }

  if (resolveTaskKind(task) === 'image') {
    return task.outputImages
  }

  return []
}

function isTaskEditSourceImage(
  task: TaskRecord,
  imageId: string,
  sourceImageIds: string[],
  hasMask: boolean,
): boolean {
  if (!hasMask) {
    return false
  }

  return task.editSourceImageId ? task.editSourceImageId === imageId : sourceImageIds[0] === imageId
}

function buildReusableInputImage(
  task: TaskRecord,
  imageId: string,
  dataUrl: string,
  maskDataUrl: string | null,
  isEditSourceImage: boolean,
): InputImage {
  const isImageTask = resolveTaskKind(task) === 'image'

  return {
    id: imageId,
    dataUrl,
    maskDataUrl: isEditSourceImage ? maskDataUrl : null,
    editSelection: isEditSourceImage ? task.editSelection ?? null : null,
    sourceTaskId: isImageTask || isEditSourceImage ? task.id : null,
    lineageParentTaskId: isImageTask || isEditSourceImage ? task.id : null,
    sourceImageId:
      isImageTask
        ? imageId
        : isEditSourceImage
          ? task.editSourceImageId ?? imageId
          : null,
    lineageParentImageId:
      isImageTask
        ? imageId
        : isEditSourceImage
          ? task.editSourceImageId ?? imageId
          : null,
  }
}

export async function buildReusableInputImagesFromTask(task: TaskRecord): Promise<InputImage[]> {
  const maskDataUrl = task.editMaskImageId ? await ensureImageAssetDataUrl(task.editMaskImageId) : null
  const sourceImageIds = resolveReusableTaskImageIds(task)
  const inputImages: InputImage[] = []

  for (const imageId of sourceImageIds) {
    const dataUrl = await ensureImageAssetDataUrl(imageId)
    if (!dataUrl) {
      continue
    }

    inputImages.push(
      buildReusableInputImage(
        task,
        imageId,
        dataUrl,
        maskDataUrl ?? null,
        isTaskEditSourceImage(task, imageId, sourceImageIds, Boolean(maskDataUrl)),
      ),
    )
  }

  return inputImages
}
