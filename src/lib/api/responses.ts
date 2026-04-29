import type { AppliedTransportMeta, AppSettings, ResponsesImageInputMode } from '../../types'
import {
  buildApiErrorFromResponse,
  buildAppliedTransportMeta,
  buildRequestUrl,
  buildResponsesPrompt,
  buildTaskResponseMetaFromCalls,
  collectImageGenerationCallsFromPayload,
  createApiError,
  createDebugRequestLogEntry,
  dataUrlToBlob,
  emitFinalImages,
  getFileExtensionFromMime,
  getResponsesImageInputMode,
  getResponsesImageModel,
  getResponsesTransportMode,
  isDataUrl,
  isHttpUrl,
  isRecord,
  mergeTaskResponseMeta,
  parseImagesFromPayload,
  readDevProxyRequestId,
  readResponsesPayload,
  readResponsesPayloadStream,
  sanitizeDebugValue,
  shouldFallbackResponsesStreamToJson,
  shouldRetryResponsesWithCompatibility,
  shouldRetryResponsesWithFileId,
  shrinkDataUrlForResponses,
  shrinkImageAndMaskForResponses,
} from './helpers'
import type {
  ActualTransportKind,
  ApiError,
  CallApiOptions,
  CallApiResult,
  ResponsesActionMode,
  ResponsesInputContent,
  ResponsesInputImage,
  ResponsesInputImageMask,
  ResponsesInputPayloadMode,
  ResponsesRequestPlan,
  ResponsesToolChoiceMode,
  ResponsesTransportKind,
  SharedRequestContext,
} from './types'

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

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: ctx.requestHeaders,
    cache: 'no-store',
    body: formData,
    signal: ctx.controller.signal,
  })

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

function attachDebugUploadResponse(entry: ReturnType<typeof createDebugRequestLogEntry>, response: Response) {
  entry.responseStatus = response.status
  entry.responseRequestId = readDevProxyRequestId(response.headers) || null
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

async function prepareResponsesInputImages(
  baseUrl: string,
  inputImageDataUrls: string[],
  imageInputMode: ResponsesImageInputMode,
  ctx: SharedRequestContext,
  options?: {
    preserveOriginalIndices?: Set<number>
  },
): Promise<{ inputImages: ResponsesInputImage[]; uploadedFileIds: string[] }> {
  if (!inputImageDataUrls.length) {
    return { inputImages: [], uploadedFileIds: [] }
  }

  const inputImages: ResponsesInputImage[] = []
  const uploadedFileIds: string[] = []
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

    if (isDataUrl(inputImage)) {
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
          const status = (error as ApiError | undefined)?.status
          const message = error instanceof Error ? error.message : String(error)
          if (
            (status != null && [400, 404, 405, 415, 422, 501].includes(status)) ||
            /(?:\/v1\/files|multipart|file upload|file_id|vision|unsupported|not implemented)/i.test(message)
          ) {
            throw createApiError(
              '当前中转站不支持 Responses 参考图 file_id 上传，请把“Responses 参考图输入”改回“自动”后重试。',
              status,
            )
          }
          throw error
        }
      }

      const optimizedDataUrl =
        options?.preserveOriginalIndices?.has(index)
          ? inputImage
          : await shrinkDataUrlForResponses(inputImage, inlineImageTargetBytes)
      inputImages.push({
        type: 'input_image',
        image_url: optimizedDataUrl,
      })
      continue
    }

    throw createApiError('不支持的参考图格式，请使用本地图片或公网图片 URL')
  }

  return { inputImages, uploadedFileIds }
}

async function prepareResponsesEditMask(
  baseUrl: string,
  maskDataUrl: string | undefined,
  imageInputMode: ResponsesImageInputMode,
  ctx: SharedRequestContext,
): Promise<{ editMask?: ResponsesInputImageMask; uploadedFileIds: string[] }> {
  if (!maskDataUrl) {
    return { editMask: undefined, uploadedFileIds: [] }
  }

  if (imageInputMode === 'file_id') {
    try {
      const fileId = await uploadInputImageAsFileId(baseUrl, maskDataUrl, 999, ctx)
      return {
        editMask: { file_id: fileId },
        uploadedFileIds: [fileId],
      }
    } catch (error) {
      const status = (error as ApiError | undefined)?.status
      const message = error instanceof Error ? error.message : String(error)
      if (
        (status != null && [400, 404, 405, 415, 422, 501].includes(status)) ||
        /(?:\/v1\/files|multipart|file upload|file_id|vision|unsupported|not implemented)/i.test(message)
      ) {
        throw createApiError(
          '当前中转站不支持 Responses 蒙版 file_id 上传，请把“Responses 参考图输入”改回“自动”后重试。',
          status,
        )
      }
      throw error
    }
  }

  return {
    editMask: { image_url: maskDataUrl },
    uploadedFileIds: [],
  }
}

async function prepareResponsesInlineEditAssets(
  opts: CallApiOptions,
  imageInputMode: ResponsesImageInputMode,
): Promise<{
  inputImageDataUrls: string[]
  editMaskDataUrl: string | undefined
  preserveOriginalIndices?: Set<number>
}> {
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

  const resized = await shrinkImageAndMaskForResponses(sourceImage, opts.editMaskDataUrl)
  const inputImageDataUrls = [...opts.inputImageDataUrls]
  inputImageDataUrls[sourceIndex] = resized.imageDataUrl

  return {
    inputImageDataUrls,
    editMaskDataUrl: resized.maskDataUrl,
    preserveOriginalIndices: new Set([sourceIndex]),
  }
}

function buildResponsesInput(prompt: string, inputImages: ResponsesInputImage[]) {
  const content: ResponsesInputContent[] = []

  if (prompt.trim()) {
    content.push({ type: 'input_text', text: prompt })
  }

  for (const inputImage of inputImages) {
    content.push(inputImage)
  }

  return [
    {
      role: 'user',
      content,
    },
  ]
}

function buildResponsesInputPayload(
  prompt: string,
  inputImages: ResponsesInputImage[],
  mode: ResponsesInputPayloadMode,
) {
  if (mode === 'compact-string' && !inputImages.length && prompt.trim()) {
    return prompt.trim()
  }

  return buildResponsesInput(prompt, inputImages)
}

function getPreferredResponsesTransports(settings: AppSettings): ResponsesTransportKind[] {
  const mode = getResponsesTransportMode(settings)
  if (mode === 'stream') {
    return ['stream']
  }
  if (mode === 'json') {
    return ['json']
  }
  return ['stream', 'json']
}

function buildResponsesRequestPlans(
  opts: CallApiOptions,
  inputImages: ResponsesInputImage[],
): ResponsesRequestPlan[] {
  const hasReferenceImages = inputImages.length > 0
  const hasEditMask = Boolean(opts.editMaskDataUrl)
  const defaultInputPayloadMode: ResponsesInputPayloadMode =
    hasReferenceImages ? 'message-list' : 'compact-string'
  const transports = getPreferredResponsesTransports(opts.settings)
  const primaryTransports: ResponsesTransportKind[] =
    hasEditMask && getResponsesTransportMode(opts.settings) === 'auto'
      ? ['json', 'stream']
      : transports
  const allowJsonCompatibilityFallback = getResponsesTransportMode(opts.settings) === 'auto'
  const compatibilityTransports: ResponsesTransportKind[] = allowJsonCompatibilityFallback ? ['json'] : transports
  const plans: ResponsesRequestPlan[] = []

  const pushPlan = (plan: ResponsesRequestPlan) => {
    if (!plans.some((item) => item.id === plan.id)) {
      plans.push(plan)
    }
  }

  for (const transport of primaryTransports) {
    pushPlan({
      id: `official-${transport}-${defaultInputPayloadMode}`,
      inputPayloadMode: defaultInputPayloadMode,
      transport,
      actionMode: hasEditMask ? 'explicit' : 'auto',
      toolChoiceMode: hasEditMask ? 'force' : 'omit',
    })
  }

  if (hasReferenceImages && !hasEditMask) {
    for (const transport of compatibilityTransports) {
      pushPlan({
        id: `explicit-action-${transport}`,
        inputPayloadMode: 'message-list',
        transport,
        actionMode: 'explicit',
        toolChoiceMode: 'omit',
      })
    }
  }

  if (!hasReferenceImages) {
    for (const transport of compatibilityTransports) {
      pushPlan({
        id: `message-list-${transport}`,
        inputPayloadMode: 'message-list',
        transport,
        actionMode: 'auto',
        toolChoiceMode: 'omit',
      })
    }
  }

  if (!hasEditMask) {
    const forcedToolInputPayloadMode: ResponsesInputPayloadMode =
      !hasReferenceImages && defaultInputPayloadMode !== 'message-list'
        ? 'message-list'
        : defaultInputPayloadMode
    const forcedToolActionMode: ResponsesActionMode =
      hasReferenceImages || forcedToolInputPayloadMode === 'message-list' ? 'explicit' : 'auto'

    for (const transport of compatibilityTransports) {
      pushPlan({
        id: `forced-tool-${transport}-${forcedToolInputPayloadMode}`,
        inputPayloadMode: forcedToolInputPayloadMode,
        transport,
        actionMode: forcedToolActionMode,
        toolChoiceMode: 'force',
      })
    }
  }

  return plans
}

function buildResponsesBody(
  opts: CallApiOptions,
  inputImages: ResponsesInputImage[],
  editMask: ResponsesInputImageMask | undefined,
  plan: ResponsesRequestPlan,
): Record<string, unknown> {
  const { settings, prompt, params } = opts
  const responsesPrompt = buildResponsesPrompt(prompt, settings)
  const hasReferenceImages = inputImages.length > 0
  const tool: Record<string, unknown> = {
    type: 'image_generation',
    model: getResponsesImageModel(settings),
  }

  if (params.size) {
    tool.size = params.size
  }
  if (params.quality) {
    tool.quality = params.quality
  }
  if (params.output_format) {
    tool.output_format = params.output_format
  }
  if (params.moderation) {
    tool.moderation = params.moderation
  }
  if (params.output_format !== 'png' && params.output_compression != null) {
    tool.output_compression = params.output_compression
  }
  if (editMask) {
    tool.input_image_mask = editMask
  }
  if (plan.actionMode === 'explicit') {
    tool.action = hasReferenceImages ? 'edit' : 'generate'
  }
  if (plan.transport === 'stream') {
    tool.partial_images = 1
  }

  const body: Record<string, unknown> = {
    model: settings.model,
    input: buildResponsesInputPayload(responsesPrompt, inputImages, plan.inputPayloadMode),
    tools: [tool],
  }

  if (plan.transport === 'stream') {
    body.stream = true
  }
  if (plan.toolChoiceMode === 'force') {
    body.tool_choice = { type: 'image_generation' }
  }

  return body
}

export async function callResponsesApi(
  opts: CallApiOptions,
  ctx: SharedRequestContext,
): Promise<CallApiResult> {
  const responsesImageInputMode = getResponsesImageInputMode(opts.settings)

  try {
    return await callResponsesApiWithInputMode(opts, ctx, responsesImageInputMode)
  } catch (error) {
    if (!shouldRetryResponsesWithFileId(error, responsesImageInputMode, opts)) {
      throw error
    }

    try {
      return await callResponsesApiWithInputMode(opts, ctx, 'file_id')
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

async function callResponsesApiWithInputMode(
  opts: CallApiOptions,
  ctx: SharedRequestContext,
  responsesImageInputMode: ResponsesImageInputMode,
): Promise<CallApiResult> {
  const requestCount = Math.max(1, opts.params.n || 1)
  const images: string[] = []
  const responseImageGenerationCalls: Parameters<typeof buildTaskResponseMetaFromCalls>[0] = []
  let finalTransportMeta: AppliedTransportMeta | undefined
  const preparedEditAssets = await prepareResponsesInlineEditAssets(opts, responsesImageInputMode)
  const { inputImages, uploadedFileIds } = await prepareResponsesInputImages(
    opts.settings.baseUrl,
    preparedEditAssets.inputImageDataUrls,
    responsesImageInputMode,
    ctx,
    { preserveOriginalIndices: preparedEditAssets.preserveOriginalIndices },
  )
  const { editMask, uploadedFileIds: uploadedMaskFileIds } = await prepareResponsesEditMask(
    opts.settings.baseUrl,
    preparedEditAssets.editMaskDataUrl,
    responsesImageInputMode,
    ctx,
  )
  const allUploadedFileIds = [...uploadedFileIds, ...uploadedMaskFileIds]
  const requestPlans = buildResponsesRequestPlans(opts, inputImages)

  try {
    for (let index = 0; index < requestCount; index += 1) {
      let lastError: unknown = null

      for (let planIndex = 0; planIndex < requestPlans.length; planIndex += 1) {
        const plan = requestPlans[planIndex]
        const nextPlan = requestPlans[planIndex + 1]

        try {
          let actualTransport: ActualTransportKind = 'json'
          const requestUrl = buildRequestUrl(opts.settings.baseUrl, 'responses', ctx)
          const requestBody = buildResponsesBody(opts, inputImages, editMask, plan)
          const debugLogEntry = createDebugRequestLogEntry(
            ctx,
            `responses.${plan.id}`,
            'POST',
            requestUrl,
            requestBody,
          )
          const response = await fetch(requestUrl, {
            method: 'POST',
            headers: {
              ...ctx.requestHeaders,
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify(requestBody),
            signal: ctx.controller.signal,
          })

          if (!response.ok) {
            throw await buildApiErrorFromResponse(response, debugLogEntry)
          }

          const requestId = readDevProxyRequestId(response.headers)
          const streamResult =
            plan.transport === 'stream'
              ? await readResponsesPayloadStream(
                  response,
                  ctx.mime,
                  ctx.controller.signal,
                  opts.onFinalImages,
                  debugLogEntry,
                )
              : null
          const payload = streamResult?.payload ?? (await readResponsesPayload(response, debugLogEntry))
          const streamedFinalImageCount = streamResult?.streamedFinalImageCount ?? 0
          actualTransport = streamResult?.actualTransport ?? 'json'
          responseImageGenerationCalls.push(...collectImageGenerationCallsFromPayload(payload))
          const parsedImages = await parseImagesFromPayload(payload, ctx.mime, ctx.controller.signal)
          if (!parsedImages.length) {
            debugLogEntry.responseBody = sanitizeDebugValue(payload)
            throw createApiError('Responses API 未返回可用图片数据', response.status, {
              requestId,
              details: {
                responseBody: payload,
              },
            })
          }

          if (streamedFinalImageCount < parsedImages.length) {
            await emitFinalImages(opts, parsedImages.slice(streamedFinalImageCount))
          }
          const fallbackFromStream =
            actualTransport === 'json' &&
            requestPlans.slice(0, planIndex).some((item) => item.transport === 'stream')
          finalTransportMeta = buildAppliedTransportMeta(
            getResponsesTransportMode(opts.settings),
            actualTransport,
            fallbackFromStream,
          )
          images.push(...parsedImages)
          lastError = null
          break
        } catch (error) {
          lastError = error
          const isLastPlan = planIndex === requestPlans.length - 1
          if (
            isLastPlan ||
            (!shouldRetryResponsesWithCompatibility(error) &&
              !shouldFallbackResponsesStreamToJson(error, plan, nextPlan))
          ) {
            throw error
          }
        }
      }

      if (lastError) {
        throw lastError
      }
    }
  } finally {
    await Promise.all(
      allUploadedFileIds.map((fileId) => deleteUploadedFile(opts.settings.baseUrl, fileId, ctx)),
    )
  }

  if (!images.length) {
    throw createApiError('Responses API 未返回可用图片数据')
  }

  const responseMetaFromCalls = buildTaskResponseMetaFromCalls(responseImageGenerationCalls)
  const responseMeta =
    finalTransportMeta != null
      ? mergeTaskResponseMeta(responseMetaFromCalls, finalTransportMeta)
      : responseMetaFromCalls
  return responseMeta ? { images, responseMeta } : { images }
}
