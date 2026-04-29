import { normalizeImageSize } from '../lib/size'
import type { ImageEditSelection, ImageEditSession, InputImage, TaskRecord } from '../types'
import { ensureImageCached } from './cache'
import { findProviderById } from './domain'
import { submitTask } from './runtime'
import { useStore } from './state'

export async function editOutputs(task: TaskRecord, preferredImageId?: string) {
  const { setImageEditSession, showToast } = useStore.getState()
  const sourceImageId =
    preferredImageId && task.outputImages.includes(preferredImageId)
      ? preferredImageId
      : task.outputImages?.[0]
  if (!sourceImageId) {
    return
  }

  const sourceImageDataUrl = await ensureImageCached(sourceImageId)
  if (!sourceImageDataUrl) {
    showToast('输出图读取失败，无法进入编辑器', 'error')
    return
  }

  setImageEditSession({
    taskId: task.id,
    providerId: task.providerId ?? null,
    sourceImageId,
    sourceImageDataUrl,
    sourceImageIds: [...task.outputImages],
    prompt: task.prompt,
    params: task.params,
    initialSelection: task.editSelection ?? null,
  })
}

export function reopenImageEditorFromInputImage(inputImage: InputImage) {
  const { activeProviderId, prompt, params, tasks, setImageEditSession, showToast } =
    useStore.getState()

  if (!inputImage.dataUrl) {
    showToast('当前参考图不可用，无法重新打开编辑器', 'error')
    return
  }

  const sourceTask = inputImage.sourceTaskId
    ? tasks.find((task) => task.id === inputImage.sourceTaskId)
    : null

  setImageEditSession({
    taskId: inputImage.sourceTaskId ?? 'input-image',
    providerId: sourceTask?.providerId ?? activeProviderId ?? null,
    sourceImageId: inputImage.sourceImageId ?? inputImage.id,
    sourceImageDataUrl: inputImage.dataUrl,
    sourceImageIds: sourceTask?.outputImages
      ? [...sourceTask.outputImages]
      : [inputImage.sourceImageId ?? inputImage.id],
    prompt: sourceTask?.prompt ?? prompt.trim(),
    params: sourceTask?.params ?? params,
    initialSelection: inputImage.editSelection ?? null,
  })
}

export function closeImageEditor() {
  useStore.getState().setImageEditSession(null)
}

export function clearInputImageEdit(index: number) {
  const { inputImages, setInputImages, showToast } = useStore.getState()
  const targetImage = inputImages[index]
  if (!targetImage) {
    return
  }

  if (!targetImage.maskDataUrl && !targetImage.editSelection) {
    showToast('这张参考图当前没有局部编辑蒙版', 'info')
    return
  }

  setInputImages(
    inputImages.map((image, imageIndex) =>
      imageIndex === index
        ? {
            ...image,
            maskDataUrl: null,
            editSelection: null,
          }
        : image,
    ),
  )
  showToast('已移除该参考图的局部编辑区域', 'success')
}

export async function applyImageEditToInput(options: {
  session: ImageEditSession
  prompt: string
  providerId?: string | null
  maskDataUrl?: string | null
  selection?: ImageEditSelection | null
  sourceSize?: string
  submit?: boolean
}) {
  const {
    providers,
    setActiveProvider,
    setPrompt,
    setParams,
    setInputImages,
    setImageEditSession,
    showToast,
  } = useStore.getState()

  const provider = findProviderById(providers, options.providerId ?? options.session.providerId)
  if (provider) {
    setActiveProvider(provider.id)
  }

  setPrompt(options.prompt.trim())
  setParams({
    ...options.session.params,
    size: options.sourceSize
      ? normalizeImageSize(options.sourceSize) || options.session.params.size
      : options.session.params.size,
  })
  setInputImages([
    {
      id: options.session.sourceImageId,
      dataUrl: options.session.sourceImageDataUrl,
      maskDataUrl: options.maskDataUrl ?? null,
      editSelection: options.selection ?? null,
      sourceTaskId: options.session.taskId,
      sourceImageId: options.session.sourceImageId,
    },
  ])
  setImageEditSession(null)
  showToast(
    options.submit
      ? options.maskDataUrl
        ? '已写入输入区，正在提交局部编辑任务'
        : '已写入输入区，正在提交整图编辑任务'
      : options.maskDataUrl
        ? '已写入局部编辑输入区'
        : '已写入整图编辑输入区',
    'success',
  )

  if (options.submit) {
    await submitTask()
  }
}
