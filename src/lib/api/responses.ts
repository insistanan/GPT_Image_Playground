import type { AppliedTransportMeta, TaskResponseMeta } from '../../types'

import { abortAwareFetch } from './abort'

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
} from './debug'

import {
  buildTaskResponseMetaFromCalls,
} from './imagePayload'
import { normalizeResponsesResponse } from './responsesNormalizer'

import {
  createResponsesPlanner,
  isUnsupportedOutputCountError,
  mergeTaskResponseTransportMeta,
  shouldBlockConcurrentNFallback,
} from './requestPlanner'

import { buildResponsesRequestBody } from './responsesRequestBuilder'

import { prepareResponsesInputWithFallback } from './responsesInputPreparation'

import type {
  ApiImageAsset,
  CallApiOptions,
  CallApiResult,
  SharedRequestContext,
} from './types'

interface ResponsesPreparedInput {
  inputImages: Parameters<typeof buildResponsesRequestBody>[0]['inputImages']
  editMask?: Parameters<typeof buildResponsesRequestBody>[0]['editMask']
}

function withSingleImageParams(opts: CallApiOptions): CallApiOptions {
  if ((opts.params.n || 1) <= 1) {
    return opts
  }

  return {
    ...opts,
    params: {
      ...opts.params,
      n: 1,
    },
  }
}

function withRequestScopedPartialHandler(
  opts: CallApiOptions,
  requestIndex: number,
): CallApiOptions {
  if (typeof opts.onPartialImage !== 'function') {
    return opts
  }

  return {
    ...opts,
    onPartialImage: (partial) => opts.onPartialImage?.({
      ...partial,
      requestIndex,
    }),
  }
}

function mergeTransportMeta(
  current: AppliedTransportMeta | undefined,
  next: AppliedTransportMeta | undefined,
): AppliedTransportMeta | undefined {
  if (!current) {
    return next
  }
  if (!next) {
    return current
  }

  return {
    requested: current.requested ?? next.requested,
    actual: next.actual ?? current.actual,
    fallbackFromStream: Boolean(current.fallbackFromStream || next.fallbackFromStream),
  }
}

function mergeResponseMeta(
  current: TaskResponseMeta | undefined,
  next: TaskResponseMeta | undefined,
): TaskResponseMeta | undefined {
  if (!current) {
    return next
  }
  if (!next) {
    return current
  }

  return {
    ...current,
    ...next,
    appliedImageParams: next.appliedImageParams ?? current.appliedImageParams,
    revisedPrompt: next.revisedPrompt ?? current.revisedPrompt,
    transport: mergeTransportMeta(current.transport, next.transport),
  }
}

function mergeCallResults(results: CallApiResult[]): CallApiResult {
  const images: ApiImageAsset[] = []
  let responseMeta: TaskResponseMeta | undefined

  for (const result of results) {
    for (const image of result.images) {
      images.push(image)
    }
    responseMeta = mergeResponseMeta(responseMeta, result.responseMeta)
  }

  return responseMeta ? { images, responseMeta } : { images }
}

function shouldFallbackToConcurrentN(error: unknown, requestedImageCount: number): boolean {
  if (requestedImageCount <= 1 || shouldBlockConcurrentNFallback(error)) {
    return false
  }

  return isUnsupportedOutputCountError(error)
}

async function executeResponsesRequest(
  opts: CallApiOptions,
  ctx: SharedRequestContext,
  preparedInput: ResponsesPreparedInput,
): Promise<CallApiResult> {
  const images: ApiImageAsset[] = []
  const responseImageGenerationCalls: Parameters<typeof buildTaskResponseMetaFromCalls>[0] = []
  let finalTransportMeta: AppliedTransportMeta | undefined
  const planner = createResponsesPlanner(opts, preparedInput.inputImages)

  while (true) {
    const plan = planner.currentPlan

    try {
      ctx.refreshTimeout()
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
      const response = await abortAwareFetch(requestUrl, {
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
        opts.onPartialImage,
      )
      for (const call of normalized.imageGenerationCalls) {
        responseImageGenerationCalls.push(call)
      }

      await emitFinalImages(opts, normalized.images)
      finalTransportMeta = planner.completeSuccess(normalized.actualTransport)
      for (const image of normalized.images) {
        images.push(image)
      }
      break
    } catch (error) {
      if (!planner.failAndAdvance(error)) {
        throw error
      }
    }
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

async function executeResponsesRequestsConcurrently(
  opts: CallApiOptions,
  ctx: SharedRequestContext,
  preparedInput: ResponsesPreparedInput,
  count: number,
): Promise<CallApiResult> {
  const singleOpts = withSingleImageParams(opts)
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, requestIndex) =>
      executeResponsesRequest(
        withRequestScopedPartialHandler(singleOpts, requestIndex),
        ctx,
        preparedInput,
      ),
    ),
  )

  const successfulResults = results.filter(
    (result): result is PromiseFulfilledResult<CallApiResult> => result.status === 'fulfilled',
  )
  if (!successfulResults.length) {
    const firstRejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    throw firstRejected?.reason ?? createApiError('Responses API 未返回可用图片数据')
  }

  return mergeCallResults(successfulResults.map((result) => result.value))
}

export async function callResponsesApi(
  opts: CallApiOptions,
  ctx: SharedRequestContext,
): Promise<CallApiResult> {
  const requestedImageCount = Math.max(1, opts.params.n || 1)
  const preparedInput = await prepareResponsesInputWithFallback(
    opts,
    ctx,
    getResponsesImageInputMode(opts.settings),
  )

  try {
    try {
      const nativeResult = await executeResponsesRequest(opts, ctx, preparedInput)
      const missingImageCount = Math.max(0, requestedImageCount - nativeResult.images.length)
      if (missingImageCount === 0) {
        return nativeResult
      }

      const remainderResult = await executeResponsesRequestsConcurrently(
        opts,
        ctx,
        preparedInput,
        missingImageCount,
      )
      return mergeCallResults([nativeResult, remainderResult])
    } catch (error) {
      if (!shouldFallbackToConcurrentN(error, requestedImageCount)) {
        throw error
      }

      return await executeResponsesRequestsConcurrently(
        opts,
        ctx,
        preparedInput,
        requestedImageCount,
      )
    }
  } finally {
    await preparedInput.cleanup()
  }
}
