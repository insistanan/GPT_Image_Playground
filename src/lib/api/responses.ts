import type { AppliedTransportMeta } from '../../types'
import {
  buildRequestUrl,
  getResponsesImageInputMode,
} from './config'
import {
  createApiError,
  emitFinalImages,
} from './imageTransforms'
import {
  buildApiErrorFromResponse,
  createDebugRequestLogEntry,
  isSseResponse,
  readDevProxyRequestId,
  sanitizeDebugValue,
} from './debug'
import {
  buildTaskResponseMetaFromCalls,
  collectImageGenerationCallsFromPayload,
  parseImagesFromPayload,
} from './imagePayload'
import { normalizeResponsesResponse } from './responsesNormalizer'
import { readResponsesPayload } from './payloadText'
import {
  createResponsesPlanner,
  mergeTaskResponseTransportMeta,
} from './requestPlanner'
import { buildResponsesRequestBody } from './responsesRequestBuilder'
import { prepareResponsesInputWithFallback } from './responsesInputPreparation'
import { readResponsesPayloadStream } from './sseReader'
import type {
  ActualTransportKind,
  ApiImageAsset,
  CallApiOptions,
  CallApiResult,
  SharedRequestContext,
} from './types'

export async function callResponsesApi(
  opts: CallApiOptions,
  ctx: SharedRequestContext,
): Promise<CallApiResult> {
  let remainingImageCount = Math.max(1, opts.params.n || 1)
  const images: ApiImageAsset[] = []
  const responseImageGenerationCalls: Parameters<typeof buildTaskResponseMetaFromCalls>[0] = []
  let finalTransportMeta: AppliedTransportMeta | undefined
  const preparedInput = await prepareResponsesInputWithFallback(
    opts,
    ctx,
    getResponsesImageInputMode(opts.settings),
  )

  try {
    while (remainingImageCount > 0) {
      const planner = createResponsesPlanner(opts, preparedInput.inputImages)

      while (true) {
        const plan = planner.currentPlan

        try {
          let actualTransport: ActualTransportKind = 'json'
          const requestUrl = buildRequestUrl(opts.settings.baseUrl, 'responses', ctx)
          const requestBody = buildResponsesRequestBody({
            opts,
            inputImages: preparedInput.inputImages,
            editMask: preparedInput.editMask,
            plan,
          })
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

          const shouldReadAsStream = plan.transport === 'stream' || isSseResponse(response)
          const normalized = await normalizeResponsesResponse(
            response,
            ctx.mime,
            ctx.controller.signal,
            shouldReadAsStream,
            debugLogEntry,
          )
          for (const call of normalized.imageGenerationCalls) {
            responseImageGenerationCalls.push(call)
          }

          await emitFinalImages(opts, normalized.images)
          finalTransportMeta = planner.completeSuccess(normalized.actualTransport)
          for (const image of normalized.images) {
            images.push(image)
          }
          remainingImageCount = Math.max(0, remainingImageCount - normalized.images.length)
          break
        } catch (error) {
          if (!planner.failAndAdvance(error)) {
            throw error
          }
        }
      }
    }
  } finally {
    await preparedInput.cleanup()
  }

  if (!images.length) {
    throw createApiError('Responses API 未返回可用图片数据')
  }

  const responseMetaFromCalls = buildTaskResponseMetaFromCalls(responseImageGenerationCalls)
  const responseMeta =
    finalTransportMeta != null
      ? mergeTaskResponseTransportMeta(responseMetaFromCalls, finalTransportMeta)
      : responseMetaFromCalls
  return responseMeta ? { images, responseMeta } : { images }
}
