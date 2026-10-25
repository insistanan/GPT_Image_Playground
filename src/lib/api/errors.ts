import { isRecord } from '@/lib/guards'
import { tryParseJson } from './sse'

function extractUpstreamErrorMessageFromDetails(details: unknown): string | null {
  if (!isRecord(details)) {
    return null
  }

  const upstreamResponse = details.upstream_response
  if (isRecord(upstreamResponse)) {
    return extractErrorMessage(upstreamResponse)
  }

  if (typeof upstreamResponse !== 'string' || !upstreamResponse.trim()) {
    return null
  }

  const parsedUpstreamResponse = tryParseJson(upstreamResponse)
  if (parsedUpstreamResponse !== undefined) {
    return extractErrorMessage(parsedUpstreamResponse)
  }

  return upstreamResponse.trim()
}

export function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null
  }

  const directMessage = payload.message
  if (typeof directMessage === 'string' && directMessage.trim()) {
    return directMessage
  }

  const directDetail = payload.detail
  if (typeof directDetail === 'string' && directDetail.trim()) {
    return directDetail
  }
  if (Array.isArray(directDetail)) {
    const detailText = directDetail
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }
        if (isRecord(item)) {
          const nestedDetail = item.msg
          if (typeof nestedDetail === 'string') {
            return nestedDetail.trim()
          }
        }
        return ''
      })
      .filter(Boolean)
      .join('；')

    if (detailText) {
      return detailText
    }
  }

  const directUpstreamMessage = extractUpstreamErrorMessageFromDetails(payload.details)
  if (directUpstreamMessage) {
    return directUpstreamMessage
  }

  const error = payload.error
  if (isRecord(error)) {
    const upstreamMessage = extractUpstreamErrorMessageFromDetails(error.details)
    if (upstreamMessage) {
      return upstreamMessage
    }

    const nestedMessage = error.message
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage
    }
  }

  return null
}
