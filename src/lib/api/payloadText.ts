import { isRecord } from '@/lib/guards'
import {
  attachDebugResponseMeta,
  sanitizeDebugValue,
  summarizeDebugString,
} from './debug'
import { extractErrorMessage } from './errors'
import { createApiError } from './imageTransforms'
import {
  buildCompactResponsesPayload,
  hasDirectImagePayload,
  isCompletedImagesPayload,
  isImagesFailurePayload,
} from './payloadFacts'
import { parseSseEvents, tryParseJson } from './sse'
import type { ApiDebugRequestLogEntry } from './types'

function compactResponsesPayloadIfNeeded(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload
  }

  if (payload.type === 'response.completed' && isRecord(payload.response)) {
    return buildCompactResponsesPayload(payload.response)
  }

  if (Array.isArray(payload.output)) {
    return buildCompactResponsesPayload(payload)
  }

  return payload
}

export function parseResponsesPayloadText(
  text: string,
  responseStatus: number,
  requestId: string | undefined,
  logEntry?: ApiDebugRequestLogEntry,
): unknown {
  const directJson = tryParseJson(text)
  if (directJson !== undefined) {
    const normalizedPayload = compactResponsesPayloadIfNeeded(directJson)
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(normalizedPayload)
    }
    return normalizedPayload
  }

  const sseEvents = parseSseEvents(text)
  if (!sseEvents.length) {
    if (logEntry && text.trim()) {
      logEntry.responseText = summarizeDebugString(text)
    }
    throw createApiError('Responses API 返回了非 JSON 响应，且不是可解析的 SSE 数据', responseStatus, {
      requestId,
      details: text.trim() ? { responseText: text } : undefined,
    })
  }

  const jsonPayloads = sseEvents
    .map((event) => event.json)
    .filter((payload): payload is Record<string, unknown> => isRecord(payload))
  const outputItems = jsonPayloads
    .filter((payload) => payload.type === 'response.output_item.done' && isRecord(payload.item))
    .map((payload) => payload.item as Record<string, unknown>)

  const failedPayload = [...jsonPayloads].reverse().find((payload) => {
    if (payload.type === 'response.failed') {
      return true
    }
    const nestedResponse = payload.response
    return isRecord(nestedResponse) && nestedResponse.status === 'failed'
  })

  if (failedPayload) {
    const nestedResponse = isRecord(failedPayload.response) ? failedPayload.response : null
    const message =
      extractErrorMessage(failedPayload) ||
      (nestedResponse ? extractErrorMessage(nestedResponse) : null) ||
      'Responses API 处理失败'
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(failedPayload)
    }
    throw createApiError(message, responseStatus, {
      requestId,
      details: {
        responseBody: failedPayload,
      },
    })
  }

  const completedPayload = [...jsonPayloads].reverse().find(
    (payload) => payload.type === 'response.completed' && isRecord(payload.response),
  )
  if (completedPayload && isRecord(completedPayload.response)) {
    const completedResponse = completedPayload.response as Record<string, unknown>
    const existingOutput = Array.isArray(completedResponse.output) ? completedResponse.output : []
    const normalizedOutput = outputItems.length > 0 ? outputItems : existingOutput
    const compactResponse = buildCompactResponsesPayload(completedResponse, normalizedOutput)
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(compactResponse)
    }
    return compactResponse
  }

  if (outputItems.length > 0) {
    return {
      output: outputItems,
    }
  }

  const lastJsonPayload = [...jsonPayloads].reverse().find(Boolean)
  if (lastJsonPayload) {
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(lastJsonPayload)
    }
    return lastJsonPayload
  }

  if (logEntry && text.trim()) {
    logEntry.responseText = summarizeDebugString(text)
  }
  throw createApiError('Responses API 返回了 SSE，但未包含可解析的 JSON 事件', responseStatus, {
    requestId,
    details: text.trim() ? { responseText: text } : undefined,
  })
}

export function parseImagesPayloadText(
  text: string,
  responseStatus: number,
  requestId: string | undefined,
  logEntry?: ApiDebugRequestLogEntry,
): unknown {
  const directJson = tryParseJson(text)
  if (directJson !== undefined) {
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(directJson)
    }
    return directJson
  }

  const sseEvents = parseSseEvents(text)
  if (!sseEvents.length) {
    if (logEntry && text.trim()) {
      logEntry.responseText = summarizeDebugString(text)
    }
    throw createApiError('Images API 返回了非 JSON 响应，且不是可解析的 SSE 数据', responseStatus, {
      requestId,
      details: text.trim() ? { responseText: text } : undefined,
    })
  }

  const jsonPayloads = sseEvents
    .map((event) => event.json)
    .filter((payload): payload is Record<string, unknown> => isRecord(payload))

  const failedPayload = [...jsonPayloads].reverse().find((payload) => isImagesFailurePayload(payload))
  if (failedPayload) {
    const message = extractErrorMessage(failedPayload) || 'Images API 处理失败'
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(failedPayload)
    }
    throw createApiError(message, responseStatus, {
      requestId,
      details: {
        responseBody: failedPayload,
      },
    })
  }

  const completedItems = jsonPayloads.filter((payload) => isCompletedImagesPayload(payload))
  if (completedItems.length > 0) {
    const completedPayload = { data: completedItems }
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(completedPayload)
    }
    return completedPayload
  }

  const standaloneImages = jsonPayloads.filter(
    (payload) => payload.type == null && hasDirectImagePayload(payload),
  )
  if (standaloneImages.length > 0) {
    const standalonePayload = { data: standaloneImages }
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(standalonePayload)
    }
    return standalonePayload
  }

  const lastJsonPayload = [...jsonPayloads].reverse().find(Boolean)
  if (lastJsonPayload) {
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(lastJsonPayload)
    }
    return lastJsonPayload
  }

  if (logEntry && text.trim()) {
    logEntry.responseText = summarizeDebugString(text)
  }
  throw createApiError('Images API 返回了 SSE，但未包含可解析的 JSON 事件', responseStatus, {
    requestId,
    details: text.trim() ? { responseText: text } : undefined,
  })
}

export async function readResponsesPayload(
  response: Response,
  logEntry?: ApiDebugRequestLogEntry,
): Promise<unknown> {
  const text = await response.text()
  const requestId = attachDebugResponseMeta(logEntry, response)
  return parseResponsesPayloadText(text, response.status, requestId, logEntry)
}

export async function readImagesPayload(
  response: Response,
  logEntry?: ApiDebugRequestLogEntry,
): Promise<unknown> {
  const text = await response.text()
  const requestId = attachDebugResponseMeta(logEntry, response)
  return parseImagesPayloadText(text, response.status, requestId, logEntry)
}
