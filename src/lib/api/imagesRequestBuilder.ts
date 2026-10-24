import { buildRequestUrl } from './config'
import { appendSharedImageParams } from './sharedImageParams'
import { createApiError, dataUrlToBlob, isDataUrl, isHttpUrl } from './imageTransforms'
import type { CallApiOptions, ImagesRequestPlan, SharedRequestContext } from './types'

interface BuildImagesRequestSpecOptions {
  opts: Pick<CallApiOptions, 'settings' | 'prompt' | 'params' | 'inputImageDataUrls' | 'editMaskDataUrl'>
  plan: ImagesRequestPlan
  ctx: SharedRequestContext
}

export interface ImagesRequestSpec {
  stage: string
  requestUrl: string
  debugBody: unknown
  requestInit: RequestInit
}

function appendCommonEditFormFields(
  formData: FormData,
  opts: Pick<CallApiOptions, 'settings' | 'prompt' | 'params'>,
  plan: ImagesRequestPlan,
) {
  const { settings, prompt, params } = opts
  formData.append('model', settings.model)
  formData.append('prompt', prompt)
  formData.append('size', params.size)
  formData.append('quality', params.quality)
  formData.append('output_format', params.output_format)
  formData.append('moderation', params.moderation)
  if (params.output_format !== 'png' && params.output_compression != null) {
    formData.append('output_compression', String(params.output_compression))
  }
  appendSharedImageParams(formData, params, {
    isEdit: true,
    stream: plan.transport === 'stream',
  })
  if (plan.transport === 'stream') {
    formData.append('stream', 'true')
  }
}

function buildImagesGenerateRequestSpec({
  opts,
  plan,
  ctx,
}: BuildImagesRequestSpecOptions): ImagesRequestSpec {
  const { settings, prompt, params } = opts
  const body: Record<string, unknown> = {
    model: settings.model,
    prompt,
    size: params.size,
    quality: params.quality,
    output_format: params.output_format,
    moderation: params.moderation,
  }

  if (params.output_format !== 'png' && params.output_compression != null) {
    body.output_compression = params.output_compression
  }
  appendSharedImageParams(body, params, {
    stream: plan.transport === 'stream',
  })
  if (plan.transport === 'stream') {
    body.stream = true
  }

  return {
    stage: `images.generate.${plan.id}`,
    requestUrl: buildRequestUrl(settings.baseUrl, 'images/generations', ctx),
    debugBody: body,
    requestInit: {
      method: 'POST',
      headers: {
        ...ctx.requestHeaders,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify(body),
      signal: ctx.controller.signal,
    },
  }
}

async function buildImagesEditJsonRequestSpec({
  opts,
  plan,
  ctx,
}: BuildImagesRequestSpecOptions): Promise<ImagesRequestSpec> {
  const { settings, prompt, params, inputImageDataUrls, editMaskDataUrl } = opts
  const images = inputImageDataUrls.map((value) => {
    if (!isDataUrl(value) && !isHttpUrl(value)) {
      throw createApiError('编辑参考图格式不受支持，请使用本地图片或公网图片 URL')
    }
    return { image_url: value }
  })

  const body: Record<string, unknown> = {
    model: settings.model,
    prompt,
    images,
    size: params.size,
    quality: params.quality,
    output_format: params.output_format,
    moderation: params.moderation,
  }

  if (params.output_format !== 'png' && params.output_compression != null) {
    body.output_compression = params.output_compression
  }
  appendSharedImageParams(body, params, {
    isEdit: true,
    stream: plan.transport === 'stream',
  })
  if (editMaskDataUrl) {
    if (!isDataUrl(editMaskDataUrl) && !isHttpUrl(editMaskDataUrl)) {
      throw createApiError('编辑蒙版格式不受支持，请使用本地图片或公网图片 URL')
    }
    body.mask = {
      image_url: editMaskDataUrl,
    }
  }
  if (plan.transport === 'stream') {
    body.stream = true
  }

  return {
    stage: `images.edit.${plan.id}`,
    requestUrl: buildRequestUrl(settings.baseUrl, 'images/edits', ctx),
    debugBody: {
      ...body,
      imageCount: inputImageDataUrls.length,
      hasMask: Boolean(editMaskDataUrl),
      bodyMode: plan.bodyMode,
    },
    requestInit: {
      method: 'POST',
      headers: {
        ...ctx.requestHeaders,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify(body),
      signal: ctx.controller.signal,
    },
  }
}

async function buildImagesEditMultipartRequestSpec({
  opts,
  plan,
  ctx,
}: BuildImagesRequestSpecOptions): Promise<ImagesRequestSpec> {
  const { settings, prompt, params, inputImageDataUrls, editMaskDataUrl } = opts
  const formData = new FormData()
  appendCommonEditFormFields(formData, opts, plan)

  for (let index = 0; index < inputImageDataUrls.length; index += 1) {
    const dataUrl = inputImageDataUrls[index]
    const blob = await dataUrlToBlob(dataUrl)
    const ext = blob.type.split('/')[1] || 'png'
    formData.append('image[]', blob, `input-${index + 1}.${ext}`)
  }
  if (editMaskDataUrl) {
    const maskBlob = await dataUrlToBlob(editMaskDataUrl)
    formData.append('mask', maskBlob, 'mask.png')
  }

  return {
    stage: `images.edit.${plan.id}`,
    requestUrl: buildRequestUrl(settings.baseUrl, 'images/edits', ctx),
    debugBody: {
      model: settings.model,
      prompt,
      size: params.size,
      quality: params.quality,
      output_format: params.output_format,
      moderation: params.moderation,
      n: params.n > 1 ? params.n : undefined,
      background: params.background,
      input_fidelity: params.input_fidelity ?? undefined,
      output_compression: params.output_format !== 'png' ? params.output_compression : undefined,
      imageCount: inputImageDataUrls.length,
      hasMask: Boolean(editMaskDataUrl),
      stream: plan.transport === 'stream',
      partial_images: plan.transport === 'stream' ? 1 : undefined,
      bodyMode: plan.bodyMode,
    },
    requestInit: {
      method: 'POST',
      headers: ctx.requestHeaders,
      cache: 'no-store',
      body: formData,
      signal: ctx.controller.signal,
    },
  }
}

export async function buildImagesRequestSpec(
  options: BuildImagesRequestSpecOptions,
): Promise<ImagesRequestSpec> {
  const { opts, plan } = options
  const isEdit = opts.inputImageDataUrls.length > 0

  if (!isEdit) {
    return buildImagesGenerateRequestSpec(options)
  }

  if (plan.bodyMode === 'json') {
    return buildImagesEditJsonRequestSpec(options)
  }

  return buildImagesEditMultipartRequestSpec(options)
}
