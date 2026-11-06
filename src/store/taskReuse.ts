import type { InputImage, TaskRecord } from '@/types'
import { getImageView } from './imageAssets'
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
  hasEdit: boolean,
): boolean {
  if (!hasEdit) {
    return false
  }

  return task.editSourceImageId ? task.editSourceImageId === imageId : sourceImageIds[0] === imageId
}

function buildReusableInputImage(
  task: TaskRecord,
  imageId: string,
  dataUrl: string,
  maskDataUrl: string | null,
  markupDataUrl: string | null,
  isEditSourceImage: boolean,
): InputImage {
  const isImageTask = resolveTaskKind(task) === 'image'

  return {
    id: imageId,
    dataUrl,
    maskDataUrl: isEditSourceImage ? maskDataUrl : null,
    markupDataUrl: isEditSourceImage ? markupDataUrl : null,
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
  const maskDataUrl = task.editMaskImageId ? await getImageView(task.editMaskImageId).getRawDataUrl() : null
  const markupDataUrl = task.editMarkupImageId
    ? await getImageView(task.editMarkupImageId).getRawDataUrl()
    : null
  const hasEdit = Boolean(maskDataUrl || markupDataUrl)
  const sourceImageIds = resolveReusableTaskImageIds(task)
  const inputImages: InputImage[] = []

  for (const imageId of sourceImageIds) {
    const dataUrl = await getImageView(imageId).getRawDataUrl()
    if (!dataUrl) {
      continue
    }

    inputImages.push(
      buildReusableInputImage(
        task,
        imageId,
        dataUrl,
        maskDataUrl ?? null,
        markupDataUrl ?? null,
        isTaskEditSourceImage(task, imageId, sourceImageIds, hasEdit),
      ),
    )
  }

  return inputImages
}
