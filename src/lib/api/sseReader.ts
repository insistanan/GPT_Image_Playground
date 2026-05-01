import { isRecord } from '../guards'
import { sanitizeDebugValue, attachDebugResponseMeta } from './debug'
import { extractErrorMessage } from './errors'
import {
  buildStreamImageEventSignature,
  createApiError,
  decodeResponsesOutputDoneImageEventToAsset,
} from './imageTransforms'
import { emitNewImagesFromPayload } from './imagePayload'
import {
  buildCompactResponsesMetaFromFieldReaders,
  buildCompactResponsesPayload,
  buildResponsesOutputItemFromFieldReaders,
  hasDirectImagePayload,
  isCompletedImagesPayload,
  isImagesFailurePayload,
  sanitizeResponsesOutputItem,
} from './payloadFacts'
import { parseImagesPayloadText, parseResponsesPayloadText } from './payloadText'
import { consumeSseResponseText, isPartialImageSseEventName, tryParseJson } from './sse'
import type {
  ApiDebugRequestLogEntry,
  ApiImageAsset,
  ParsedSseEvent,
  ResponsesStreamImageEvent,
  StreamedPayloadResult,
} from './types'

const RESPONSES_INCOMPLETE_STREAM_ERROR =
  'Responses API 已返回流式事件，但最后未收到完整结果。请稍后重试；如果持续出现，可切换为 JSON 模式后再试。'
const IMAGES_INCOMPLETE_STREAM_ERROR =
  'Images API 已返回流式事件，但最后未收到完整结果。请稍后重试；如果持续出现，可切换为 JSON 模式后再试。'

function buildResponsesStreamEventPayloadForImages(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  if (payload.type === 'response.output_item.done' && isRecord(payload.item)) {
    return { output: [payload.item] }
  }

  if (payload.type === 'response.completed' && isRecord(payload.response)) {
    return buildCompactResponsesPayload(payload.response)
  }

  return null
}

function extractSseImageStringField(dataText: string, fieldName: string): string | undefined {
  const keyMarker = `"${fieldName}"`
  const markerIndex = dataText.indexOf(keyMarker)
  if (markerIndex < 0) {
    return undefined
  }

  let valueStart = markerIndex + keyMarker.length
  while (valueStart < dataText.length && /\s/.test(dataText[valueStart])) {
    valueStart += 1
  }
  if (dataText[valueStart] !== ':') {
    return undefined
  }

  valueStart += 1
  while (valueStart < dataText.length && /\s/.test(dataText[valueStart])) {
    valueStart += 1
  }
  if (dataText[valueStart] !== '"') {
    return undefined
  }

  valueStart += 1
  let index = valueStart
  let escaped = false

  while (index < dataText.length) {
    const char = dataText[index]
    if (escaped) {
      escaped = false
      index += 1
      continue
    }

    if (char === '\\') {
      escaped = true
      index += 1
      continue
    }

    if (char === '"') {
      return dataText.slice(valueStart, index)
    }

    index += 1
  }

  return undefined
}

function extractSseImageNumberField(dataText: string, fieldName: string): number | undefined {
  const match = dataText.match(new RegExp(`"${fieldName}"\\s*:\\s*(-?\\d+)`))
  if (!match) {
    return undefined
  }

  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseResponsesOutputDoneImageEvent(
  event: ParsedSseEvent,
): ResponsesStreamImageEvent | null {
  if (event.event !== 'response.output_item.done' || !event.dataText) {
    return null
  }

  const base64 =
    extractSseImageStringField(event.dataText, 'result') ??
    extractSseImageStringField(event.dataText, 'b64_json')
  if (!base64) {
    return null
  }

  return {
    event: event.event,
    itemId: extractSseImageStringField(event.dataText, 'id'),
    outputIndex: extractSseImageNumberField(event.dataText, 'output_index'),
    outputFormat: extractSseImageStringField(event.dataText, 'output_format'),
    background: extractSseImageStringField(event.dataText, 'background'),
    base64,
    isPartial: false,
  }
}

function sanitizeResponsesOutputItemFromDataText(dataText: string): Record<string, unknown> {
  return buildResponsesOutputItemFromFieldReaders(
    (fieldName) => extractSseImageStringField(dataText, fieldName),
    (fieldName) => extractSseImageNumberField(dataText, fieldName),
  )
}

function extractResponsesCompletedMetaFromDataText(dataText: string): Record<string, unknown> {
  return buildCompactResponsesMetaFromFieldReaders(
    (fieldName) => extractSseImageStringField(dataText, fieldName),
    (fieldName) => extractSseImageNumberField(dataText, fieldName),
  )
}

function sanitizeResponsesCompletedResponse(
  response: Record<string, unknown>,
): Record<string, unknown> {
  return buildCompactResponsesPayload(response)
}

function buildLargeResponsesCompletedPayload(
  completedResponse: Record<string, unknown> | null,
  outputItems: Record<string, unknown>[],
  lastJsonPayload: Record<string, unknown> | null,
): unknown | null {
  if (completedResponse) {
    if (outputItems.length > 0) {
      return buildCompactResponsesPayload(completedResponse, outputItems)
    }
    return completedResponse
  }

  if (outputItems.length > 0) {
    return { output: outputItems }
  }

  return lastJsonPayload
}

function buildResponsesStreamDebugDetails(options: {
  outputItems: Record<string, unknown>[]
  completedResponse: Record<string, unknown> | null
  lastJsonPayload: Record<string, unknown> | null
  streamedFinalImageCount: number
}): Record<string, unknown> {
  return {
    streamSummary: {
      usedSplitStreamPath: true,
      outputItemCount: options.outputItems.length,
      hasCompletedResponse: options.completedResponse !== null,
      hasLastJsonPayload: options.lastJsonPayload !== null,
      streamedFinalImageCount: options.streamedFinalImageCount,
    },
    lastJsonPayload: options.lastJsonPayload,
  }
}

function buildImagesStreamDebugDetails(options: {
  completedItems: Record<string, unknown>[]
  standaloneImages: Record<string, unknown>[]
  lastJsonPayload: Record<string, unknown> | null
  streamedFinalImageCount: number
}): Record<string, unknown> {
  return {
    streamSummary: {
      completedItemCount: options.completedItems.length,
      standaloneImageCount: options.standaloneImages.length,
      hasLastJsonPayload: options.lastJsonPayload !== null,
      streamedFinalImageCount: options.streamedFinalImageCount,
    },
    lastJsonPayload: options.lastJsonPayload,
  }
}

export async function readResponsesPayloadStream(
  response: Response,
  fallbackMime: string,
  signal: AbortSignal,
  logEntry?: ApiDebugRequestLogEntry,
): Promise<StreamedPayloadResult> {
  const requestId = attachDebugResponseMeta(logEntry, response)
  const emittedImageSignatures = new Set<string>()
  let streamedFinalImageCount = 0
  const streamedImages: ApiImageAsset[] = []
  const outputItems: Record<string, unknown>[] = []
  let completedResponse: Record<string, unknown> | null = null
  let failedPayload: Record<string, unknown> | null = null
  let lastJsonPayload: Record<string, unknown> | null = null

  const { text, sawAnyEvents } = await consumeSseResponseText(
    response,
    signal,
    async (event) => {
      if (isPartialImageSseEventName(event.event)) {
        return
      }

      const outputDoneImageEvent = parseResponsesOutputDoneImageEvent(event)
      if (outputDoneImageEvent?.base64) {
        const signature = buildStreamImageEventSignature(outputDoneImageEvent)
        if (!emittedImageSignatures.has(signature)) {
          const imageAsset = await decodeResponsesOutputDoneImageEventToAsset(
            outputDoneImageEvent,
            fallbackMime,
            signal,
          )
          if (imageAsset) {
            emittedImageSignatures.add(signature)
            streamedImages.push(imageAsset)
            streamedFinalImageCount += 1
          }
        }
      }

      if (event.event === 'response.output_item.done' && event.dataText) {
        outputItems.push(sanitizeResponsesOutputItemFromDataText(event.dataText))
        return
      }

      if (event.event === 'response.completed' && event.dataText) {
        completedResponse = extractResponsesCompletedMetaFromDataText(event.dataText)
        if (completedResponse.status === 'failed') {
          failedPayload = {
            type: 'response.failed',
            response: completedResponse,
          }
        }
      }

      const shouldSkipCompletedJsonParsing =
        event.event === 'response.completed' &&
        outputItems.length > 0 &&
        completedResponse?.status !== 'failed'
      const parsedJson = shouldSkipCompletedJsonParsing
        ? undefined
        : event.json ??
          (event.dataText ? tryParseJson(event.dataText) : undefined)

      if (!parsedJson || !isRecord(parsedJson)) {
        return
      }

      lastJsonPayload = parsedJson

      if (parsedJson.type === 'response.output_item.done' && isRecord(parsedJson.item)) {
        outputItems.push(sanitizeResponsesOutputItem(parsedJson.item))
      }

      if (parsedJson.type === 'response.completed' && isRecord(parsedJson.response)) {
        completedResponse = sanitizeResponsesCompletedResponse(parsedJson.response)
      }

      if (
        parsedJson.type === 'response.failed' ||
        (isRecord(parsedJson.response) && parsedJson.response.status === 'failed')
      ) {
        failedPayload = parsedJson
      }

      const imagePayload = buildResponsesStreamEventPayloadForImages(parsedJson)
      if (!imagePayload) {
        return
      }

      streamedFinalImageCount += await emitNewImagesFromPayload(
        imagePayload,
        fallbackMime,
        signal,
        emittedImageSignatures,
        async (images) => {
          for (const image of images) {
            streamedImages.push(image)
          }
        },
      )
    },
    {
      deferJsonParsing: true,
      discardPartialImageData: true,
    },
  )

  if (sawAnyEvents) {
    if (failedPayload !== null) {
      const currentFailedPayload: Record<string, unknown> = failedPayload
      const nestedResponse = isRecord(currentFailedPayload.response)
        ? currentFailedPayload.response
        : null
      const message =
        extractErrorMessage(currentFailedPayload) ||
        (nestedResponse ? extractErrorMessage(nestedResponse) : null) ||
        'Responses API 处理失败'
      if (logEntry) {
        logEntry.responseBody = sanitizeDebugValue(currentFailedPayload)
      }
      throw createApiError(message, response.status, {
        requestId,
        details: {
          responseBody: currentFailedPayload,
        },
      })
    }

    const payload = buildLargeResponsesCompletedPayload(
      completedResponse,
      outputItems,
      lastJsonPayload,
    )
    if (payload == null) {
      const details = buildResponsesStreamDebugDetails({
        outputItems,
        completedResponse,
        lastJsonPayload,
        streamedFinalImageCount,
      })
      if (logEntry) {
        logEntry.responseBody = sanitizeDebugValue(details)
      }
      throw createApiError(RESPONSES_INCOMPLETE_STREAM_ERROR, response.status, {
        requestId,
        details,
      })
    }

    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(payload)
    }

    return {
      payload,
      streamedFinalImageCount,
      streamedImages,
      actualTransport: 'stream',
    }
  }

  return {
    payload: parseResponsesPayloadText(text, response.status, requestId, logEntry),
    streamedFinalImageCount,
    streamedImages,
    actualTransport: sawAnyEvents ? 'stream' : 'json',
  }
}

export async function readImagesPayloadStream(
  response: Response,
  fallbackMime: string,
  signal: AbortSignal,
  logEntry?: ApiDebugRequestLogEntry,
): Promise<StreamedPayloadResult> {
  const requestId = attachDebugResponseMeta(logEntry, response)
  const emittedImageSignatures = new Set<string>()
  let streamedFinalImageCount = 0
  const streamedImages: ApiImageAsset[] = []
  const completedItems: Record<string, unknown>[] = []
  const standaloneImages: Record<string, unknown>[] = []
  let failedPayload: Record<string, unknown> | null = null
  let lastJsonPayload: Record<string, unknown> | null = null

  const { text, sawAnyEvents } = await consumeSseResponseText(
    response,
    signal,
    async (event) => {
      if (!event.json || !isRecord(event.json)) {
        return
      }

      lastJsonPayload = event.json

      if (isImagesFailurePayload(event.json)) {
        failedPayload = event.json
      } else if (isCompletedImagesPayload(event.json)) {
        completedItems.push(event.json)
      } else if (event.json.type == null && hasDirectImagePayload(event.json)) {
        standaloneImages.push(event.json)
      }

      streamedFinalImageCount += await emitNewImagesFromPayload(
        event.json,
        fallbackMime,
        signal,
        emittedImageSignatures,
        async (images) => {
          for (const image of images) {
            streamedImages.push(image)
          }
        },
      )
    },
  )

  if (sawAnyEvents) {
    if (failedPayload) {
      const message = extractErrorMessage(failedPayload) || 'Images API 处理失败'
      if (logEntry) {
        logEntry.responseBody = sanitizeDebugValue(failedPayload)
      }
      throw createApiError(message, response.status, {
        requestId,
        details: {
          responseBody: failedPayload,
        },
      })
    }

    let payload: unknown
    if (completedItems.length > 0) {
      payload = { data: completedItems }
    } else if (standaloneImages.length > 0) {
      payload = { data: standaloneImages }
    } else if (lastJsonPayload) {
      payload = lastJsonPayload
    } else {
      const details = buildImagesStreamDebugDetails({
        completedItems,
        standaloneImages,
        lastJsonPayload,
        streamedFinalImageCount,
      })
      if (logEntry) {
        logEntry.responseBody = sanitizeDebugValue(details)
      }
      throw createApiError(IMAGES_INCOMPLETE_STREAM_ERROR, response.status, {
        requestId,
        details,
      })
    }

    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(payload)
    }

    return {
      payload,
      streamedFinalImageCount,
      streamedImages,
      actualTransport: 'stream',
    }
  }

  return {
    payload: parseImagesPayloadText(text, response.status, requestId, logEntry),
    streamedFinalImageCount,
    streamedImages,
    actualTransport: sawAnyEvents ? 'stream' : 'json',
  }
}
