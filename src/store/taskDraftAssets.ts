import type { InputImage } from '@/types'
import { storeImage } from './imageAssets'
import type { StagedTaskDraftAssets } from './taskDraftBuilder'

export async function stageTaskDraftAssets(
  inputImages: InputImage[],
): Promise<StagedTaskDraftAssets> {
  const maskedInputs = inputImages.filter((image) => Boolean(image.maskDataUrl))
  if (maskedInputs.length > 1) {
    throw new Error('任务草稿图片资产 staging 失败：存在多张带蒙版的输入图')
  }

  const markupInputs = inputImages.filter((image) => Boolean(image.markupDataUrl))
  if (markupInputs.length > 1) {
    throw new Error('任务草稿图片资产 staging 失败：存在多张带标注的输入图')
  }
  if (maskedInputs.length > 0 && markupInputs.length > 0) {
    throw new Error('任务草稿图片资产 staging 失败：蒙版与标注不能同时使用')
  }

  for (const image of inputImages) {
    await storeImage(image.dataUrl, { id: image.id, source: 'upload' })
  }

  const maskedInput = maskedInputs[0] ?? null
  const editMaskImageId = maskedInput?.maskDataUrl
    ? await storeImage(maskedInput.maskDataUrl, { source: 'upload' })
    : null
  const markupInput = markupInputs[0] ?? null
  const editMarkupImageId = markupInput?.markupDataUrl
    ? await storeImage(markupInput.markupDataUrl, { source: 'upload' })
    : null

  return {
    inputImageIds: inputImages.map((image) => image.id),
    maskedInput,
    editMaskImageId,
    markupInput,
    editMarkupImageId,
  }
}
