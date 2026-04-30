import type { InputImage } from '../types'
import { saveImageAssetReference } from './imageAssets'
import type { StagedTaskDraftAssets } from './taskDraftBuilder'

export async function stageTaskDraftAssets(
  inputImages: InputImage[],
): Promise<StagedTaskDraftAssets> {
  const maskedInputs = inputImages.filter((image) => Boolean(image.maskDataUrl))
  if (maskedInputs.length > 1) {
    throw new Error('任务草稿图片资产 staging 失败：存在多张带蒙版的输入图')
  }

  for (const image of inputImages) {
    await saveImageAssetReference(image.dataUrl, { id: image.id, source: 'upload' })
  }

  const maskedInput = maskedInputs[0] ?? null
  const editMaskImageId = maskedInput?.maskDataUrl
    ? await saveImageAssetReference(maskedInput.maskDataUrl, { source: 'upload' })
    : null

  return {
    inputImageIds: inputImages.map((image) => image.id),
    maskedInput,
    editMaskImageId,
  }
}
