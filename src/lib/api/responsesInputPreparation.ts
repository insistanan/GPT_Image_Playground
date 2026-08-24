import type { ResponsesImageInputMode } from '../../types'
import { abortAwareFetch } from './abort'
import { buildRequestUrl } from './config'
import {
  buildApiErrorFromResponse,
  createDebugRequestLogEntry,
  readDevProxyRequestId,
  sanitizeDebugValue,
} from './debug'
import {
  createApiError,
  dataUrlToBlob,
  getFileExtensionFromMime,
  isDataUrl,
  isHttpUrl,
  shrinkDataUrlForResponses,
  shrinkImageAndMaskForResponses,
} from './imageTransforms'
import { isRecord } from '../guards'
import type {
  ApiError,
  CallApiOptions,
  ResponsesInputImage,
  ResponsesInputImageMask,
  SharedRequestContext,
} from './types'

interface PreparedInlineEditAssets {
  inputImageDataUrls: string[]
  editMaskDataUrl: string | undefined
  preserveOriginalIndices?: Set<number>
}

export interface PreparedResponsesInput {
  inputImages: ResponsesInputImage[]
  editMask?: ResponsesInputImageMask
  imageInputMode: ResponsesImageInputMode
  cleanup: () => Promise<void>
}

function attachDebugUploadResponse(
  entry: ReturnType<typeof createDebugRequestLogEntry>,
  response: Response,
) {
  entry.responseStatus = response.status
  entry.responseRequestId = readDevProxyRequestId(response.headers) || null
}

function isUnsupportedFileUploadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const status = (error as ApiError).status
  return (
    (status != null && [400, 404, 405, 415, 422, 501].includes(status)) ||
    /(?:\/v1\/files|multipart|file upload|file_id|vision|unsupported|not implemented)/i.test(
      error.message,
    )
  )
}

function isPayloadTooLargeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const status = (error as ApiError).status
  if (status === 413) {
    return true
  }

  return /(?:payload too large|request entity too large|content too large|body too large|http 413)/i.test(
    error.message,
  )
}

function shouldRetryResponsesInputWithFileId(
  error: unknown,
  imageInputMode: ResponsesImageInputMode,
  opts: CallApiOptions,
): boolean {
  if (imageInputMode !== 'auto' || !isPayloadTooLargeError(error)) {
    return false
  }

  return opts.inputImageDataUrls.some((value) => isDataUrl(value)) || Boolean(opts.editMaskDataUrl)
}

async function uploadInputImageAsFileId(
  baseUrl: string,
  dataUrl: string,
  index: number,
  ctx: SharedRequestContext,
): Promise<string> {
  const blob = await dataUrlToBlob(dataUrl)
  const ext = getFileExtensionFromMime(blob.type)
  const formData = new FormData()
  formData.append('purpose', 'vision')
  formData.append('file', blob, `input-${index + 1}.${ext}`)
  const requestUrl = buildRequestUrl(baseUrl, 'files', ctx)
  const debugLogEntry = createDebugRequestLogEntry(ctx, 'files.upload', 'POST', requestUrl, {
    purpose: 'vision',
    index,
    fileName: `input-${index + 1}.${ext}`,
    mime: blob.type || null,
    sizeBytes: blob.size,
  })

  const response = await abortAwareFetch(requestUrl, {
    method: 'POST',
    headers: ctx.requestHeaders,
    cache: 'no-store',
    body: formData,
    signal: ctx.controller.signal,
  }, ctx.controller.signal)

  if (!response.ok) {
    throw await buildApiErrorFromResponse(response, debugLogEntry)
  }

  attachDebugUploadResponse(debugLogEntry, response)
  const payload = await response.json()
  if (!isRecord(payload) || typeof payload.id !== 'string' || !payload.id) {
    debugLogEntry.responseBody = sanitizeDebugValue(payload)
    throw createApiError('文件上传成功，但未返回 file_id', response.status, {
      requestId: readDevProxyRequestId(response.headers),
      details: {
        responseBody: payload,
      },
    })
  }

  return payload.id
}

async function deleteUploadedFile(baseUrl: string, fileId: string, ctx: SharedRequestContext): Promise<void> {
  try {
    await fetch(buildRequestUrl(baseUrl, `files/${fileId}`, ctx), {
      method: 'DELETE',
      headers: ctx.requestHeaders,
      cache: 'no-store',
      signal: ctx.controller.signal,
    })
  } catch {
    /* ignore cleanup errors */
  }
}

async function prepareResponsesInlineEditAssets(
  opts: CallApiOptions,
  imageInputMode: ResponsesImageInputMode,
  ctx: SharedRequestContext,
): Promise<PreparedInlineEditAssets> {
  if (!opts.editMaskDataUrl || imageInputMode === 'file_id') {
    return {
      inputImageDataUrls: opts.inputImageDataUrls,
      editMaskDataUrl: opts.editMaskDataUrl,
      preserveOriginalIndices:
        opts.editMaskDataUrl && opts.editSourceImageIndex != null
          ? new Set([opts.editSourceImageIndex])
          : undefined,
    }
  }

  const sourceIndex = opts.editSourceImageIndex ?? 0
  const sourceImage = opts.inputImageDataUrls[sourceIndex]
  if (!sourceImage || !isDataUrl(sourceImage)) {
    return {
      inputImageDataUrls: opts.inputImageDataUrls,
      editMaskDataUrl: opts.editMaskDataUrl,
      preserveOriginalIndices: new Set([sourceIndex]),
    }
  }

  const resized = await shrinkImageAndMaskForResponses(
    sourceImage,
    opts.editMaskDataUrl,
    undefined,
    ctx.controller.signal,
  )
  const inputImageDataUrls = [...opts.inputImageDataUrls]
  inputImageDataUrls[sourceIndex] = resized.imageDataUrl

  return {
    inputImageDataUrls,
    editMaskDataUrl: resized.maskDataUrl,
    preserveOriginalIndices: new Set([sourceIndex]),
  }
}

async function prepareResponsesInputImages(
  baseUrl: string,
  inputImageDataUrls: string[],
  imageInputMode: ResponsesImageInputMode,
  ctx: SharedRequestContext,
  uploadedFileIds: string[],
  options?: {
    preserveOriginalIndices?: Set<number>
  },
): Promise<ResponsesInputImage[]> {
  if (!inputImageDataUrls.length) {
    return []
  }

  const inputImages: ResponsesInputImage[] = []
  const localDataUrlCount = inputImageDataUrls.filter((value) => isDataUrl(value)).length
  const inlineImageTargetBytes =
    localDataUrlCount > 0
      ? Math.max(
          220 * 1024,
          Math.min(700 * 1024, Math.floor((1500 * 1024) / localDataUrlCount)),
        )
      : 700 * 1024

  for (let index = 0; index < inputImageDataUrls.length; index += 1) {
    const inputImage = inputImageDataUrls[index]
    if (isHttpUrl(inputImage)) {
      inputImages.push({
        type: 'input_image',
        image_url: inputImage,
      })
      continue
    }

    if (!isDataUrl(inputImage)) {
      throw createApiError('不支持的参考图格式，请使用本地图片或公网图片 URL')
    }

    if (imageInputMode === 'file_id') {
      try {
        const fileId = await uploadInputImageAsFileId(baseUrl, inputImage, index, ctx)
        uploadedFileIds.push(fileId)
        inputImages.push({
          type: 'input_image',
          file_id: fileId,
        })
        continue
      } catch (error) {
        if (isUnsupportedFileUploadError(error)) {
          throw createApiError(
            '当前中转站不支持 Responses 参考图 file_id 上传，请把“Responses 参考图输入”改回“自动”后重试。',
            (error as ApiError | undefined)?.status,
          )
        }
        throw error
      }
    }

    const optimizedDataUrl =
      options?.preserveOriginalIndices?.has(index)
        ? inputImage
        : await shrinkDataUrlForResponses(inputImage, inlineImageTargetBytes, ctx.controller.signal)
    inputImages.push({
      type: 'input_image',
      image_url: optimizedDataUrl,
    })
  }

  return inputImages
}

async function prepareResponsesEditMask(
  baseUrl: string,
  maskDataUrl: string | undefined,
  imageInputMode: ResponsesImageInputMode,
  ctx: SharedRequestContext,
  uploadedFileIds: string[],
): Promise<ResponsesInputImageMask | undefined> {
  if (!maskDataUrl) {
    return undefined
  }

  if (imageInputMode !== 'file_id') {
    return { image_url: maskDataUrl }
  }

  try {
    const fileId = await uploadInputImageAsFileId(baseUrl, maskDataUrl, 999, ctx)
    uploadedFileIds.push(fileId)
    return { file_id: fileId }
  } catch (error) {
    if (isUnsupportedFileUploadError(error)) {
      throw createApiError(
        '当前中转站不支持 Responses 蒙版 file_id 上传，请把“Responses 参考图输入”改回“自动”后重试。',
        (error as ApiError | undefined)?.status,
      )
    }
    throw error
  }
}

export async function prepareResponsesInput(
  opts: CallApiOptions,
  ctx: SharedRequestContext,
  imageInputMode: ResponsesImageInputMode,
): Promise<PreparedResponsesInput> {
  const uploadedFileIds: string[] = []
  const preparedEditAssets = await prepareResponsesInlineEditAssets(opts, imageInputMode, ctx)

  try {
    const inputImages = await prepareResponsesInputImages(
      opts.settings.baseUrl,
      preparedEditAssets.inputImageDataUrls,
      imageInputMode,
      ctx,
      uploadedFileIds,
      { preserveOriginalIndices: preparedEditAssets.preserveOriginalIndices },
    )
    const editMask = await prepareResponsesEditMask(
      opts.settings.baseUrl,
      preparedEditAssets.editMaskDataUrl,
      imageInputMode,
      ctx,
      uploadedFileIds,
    )

    return {
      inputImages,
      editMask,
      imageInputMode,
      cleanup: async () => {
        await Promise.all(
          uploadedFileIds.map((fileId) => deleteUploadedFile(opts.settings.baseUrl, fileId, ctx)),
        )
      },
    }
  } catch (error) {
    await Promise.all(
      uploadedFileIds.map((fileId) => deleteUploadedFile(opts.settings.baseUrl, fileId, ctx)),
    )
    throw error
  }
}

export async function prepareResponsesInputWithFallback(
  opts: CallApiOptions,
  ctx: SharedRequestContext,
  preferredImageInputMode: ResponsesImageInputMode,
): Promise<PreparedResponsesInput> {
  try {
    return await prepareResponsesInput(opts, ctx, preferredImageInputMode)
  } catch (error) {
    if (!shouldRetryResponsesInputWithFileId(error, preferredImageInputMode, opts)) {
      throw error
    }

    try {
      return await prepareResponsesInput(opts, ctx, 'file_id')
    } catch (fallbackError) {
      if (fallbackError instanceof Error && /Responses .*file_id 上传/.test(fallbackError.message)) {
        throw createApiError(
          '当前供应商的 /v1/responses 会因原图和蒙版内联导致请求体过大，同时也不支持 /v1/files 上传。请改用更小图片，或更换为支持 file_id / images/edits 的供应商。',
          (error as ApiError | undefined)?.status ?? (fallbackError as ApiError | undefined)?.status,
        )
      }

      throw fallbackError
    }
  }
}
