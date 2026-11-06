import { createApiError } from './imageTransforms'
import type { ApiError } from './types'

/**
 * 审核拒绝识别：只匹配上游明确的审核类错误，避免把
 * “unknown parameter: moderation” 之类的兼容性问题误判成内容拦截。
 */
const MODERATION_REJECTION_PATTERN =
  /(?:moderation_blocked|content_policy_violation|safety[ _]system|safety_violation|violates? (?:our|the|openai's) content policy|rejected as a result of (?:our|a) safety|does not comply with (?:our|openai's) content policy)/i

function collectErrorText(error: ApiError): string {
  const parts: string[] = [error.message]
  const details = error.details

  if (details != null && typeof details === 'object') {
    const record = details as Record<string, unknown>
    for (const value of [record.responseBody, record.responseText]) {
      if (typeof value === 'string') {
        parts.push(value)
        continue
      }
      if (value != null) {
        try {
          parts.push(JSON.stringify(value))
        } catch {
          /* 忽略无法序列化的调试数据 */
        }
      }
    }
  } else if (typeof details === 'string') {
    parts.push(details)
  }

  return parts.join('\n')
}

export function isModerationRejectionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return MODERATION_REJECTION_PATTERN.test(collectErrorText(error as ApiError))
}

/**
 * 把审核拒绝统一成可读的中文提示。审核拒绝与账号、配额、网络无关，
 * 重试或换传输方式都不会成功，调用方应直接终止请求。
 */
export function normalizeModerationRejectionError(error: unknown): unknown {
  if (!isModerationRejectionError(error)) {
    return error
  }

  const apiError = error as ApiError
  return createApiError(
    '内容被安全审核拦截，本次请求未生成图片。请调整提示词、参考图或编辑区域后重试；这不是账号、配额或网络问题。',
    apiError.status,
    {
      requestId: apiError.requestId,
      details: apiError.details,
    },
  )
}
