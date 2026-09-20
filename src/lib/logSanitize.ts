/**
 * 日志字符串与嵌套值的脱敏、摘要。
 *
 * 这是唯一实现，前端 API 调试日志（api/debug.ts）和本地开发代理日志
 * （vite.config.ts 的 dev proxy）共用，避免两边各自复制一套逻辑后只修了一处。
 *
 * 必须满足两个前提：
 * 1. 脱敏：Authorization / cookie / token / secret 等凭据不能落盘。
 * 2. 有界：图片生成接口常带数 MB 的 base64，摘要过程不能全量扫描整串。
 *
 * 历史教训：曾分别在前端与 dev proxy 各写一份，其中都用了
 * `/^[A-Za-z0-9+/=]{600,}$/` 全量匹配，对大 base64 会触发
 * `Maximum call stack size exceeded`，并直接把一次成功的出图打成失败。
 */

export const LOG_STRING_PREVIEW_LIMIT = 1200
export const LOG_TEXT_PREVIEW_LIMIT = 6000
export const LOG_ARRAY_ITEM_LIMIT = 10
export const LOG_OBJECT_KEY_LIMIT = 30
export const LOG_OBJECT_DEPTH_LIMIT = 5
export const LOG_BODY_PARSE_LIMIT = 256 * 1024

/** data URL 只探测前缀，避免对整段 base64 执行正则。 */
const DATA_URL_PROBE_LIMIT = 1024
/** base64 探测只检查前若干字符，避免对超长字符串全量匹配。 */
const BASE64_PROBE_LIMIT = 4096
/** 低于该长度不按 base64 处理，保留可读原文。 */
const BASE64_MIN_LENGTH = 600

export function isSensitiveFieldName(name: string): boolean {
  return /authorization|api[-_]?key|cookie|token|secret|password/i.test(name)
}

/**
 * 判断字符串是否“像”base64。
 *
 * 只对前 BASE64_PROBE_LIMIT 个字符做字符集判断，不使用 `{600,}$` 这类
 * 需要扫描整个字符串的量词。
 */
function looksLikeBase64(value: string): boolean {
  const probe = value.length > BASE64_PROBE_LIMIT ? value.slice(0, BASE64_PROBE_LIMIT) : value
  return /^[A-Za-z0-9+/=]+$/.test(probe)
}

export function summarizeLogString(value: string): string {
  if (value.length === 0) {
    return value
  }

  if (/^Bearer\s+/i.test(value)) {
    return '[REDACTED_BEARER_TOKEN]'
  }

  if (value.startsWith('data:')) {
    const dataUrlMatch = /^data:([^;,]+)[^,]*,/.exec(value.slice(0, DATA_URL_PROBE_LIMIT))
    return `[data-url mime=${dataUrlMatch?.[1] || 'unknown'} length=${value.length}]`
  }

  if (value.length >= BASE64_MIN_LENGTH && looksLikeBase64(value)) {
    return `[base64 length=${value.length}]`
  }

  if (value.length > LOG_STRING_PREVIEW_LIMIT) {
    return `${value.slice(0, LOG_STRING_PREVIEW_LIMIT)}...[truncated ${value.length - LOG_STRING_PREVIEW_LIMIT} chars]`
  }

  return value
}

export function sanitizeLogValue(value: unknown, depth = 0, visited: WeakSet<object> = new WeakSet()): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    return summarizeLogString(value)
  }

  if (depth >= LOG_OBJECT_DEPTH_LIMIT) {
    return '[max-depth-reached]'
  }

  if (typeof value === 'object' && visited.has(value)) {
    return '[circular]'
  }
  visited.add(value)

  if (Array.isArray(value)) {
    const items = value
      .slice(0, LOG_ARRAY_ITEM_LIMIT)
      .map((item) => sanitizeLogValue(item, depth + 1, visited))

    if (value.length > LOG_ARRAY_ITEM_LIMIT) {
      items.push(`[+${value.length - LOG_ARRAY_ITEM_LIMIT} more items]`)
    }

    return items
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    const sanitizedEntries = entries
      .slice(0, LOG_OBJECT_KEY_LIMIT)
      .map(([key, nestedValue]) => [
        key,
        isSensitiveFieldName(key) ? '[REDACTED]' : sanitizeLogValue(nestedValue, depth + 1, visited),
      ] as const)

    const nextValue = Object.fromEntries(sanitizedEntries)
    if (entries.length > LOG_OBJECT_KEY_LIMIT) {
      nextValue.__truncatedKeys = entries.length - LOG_OBJECT_KEY_LIMIT
    }
    return nextValue
  }

  return String(value)
}

export function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

export function summarizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, unknown> {
  const summarized: Record<string, unknown> = {}

  for (const [name, value] of Object.entries(headers)) {
    if (value == null) continue

    if (isSensitiveFieldName(name)) {
      summarized[name] = '[REDACTED]'
      continue
    }

    summarized[name] = Array.isArray(value)
      ? value.map((item) => summarizeLogString(item))
      : summarizeLogString(value)
  }

  return summarized
}

export function summarizeResponseHeaders(headers: Headers): Record<string, unknown> {
  const summarized: Record<string, unknown> = {}

  headers.forEach((value, name) => {
    summarized[name] = isSensitiveFieldName(name) ? '[REDACTED]' : summarizeLogString(value)
  })

  return summarized
}

export function summarizeBody(
  body: Uint8Array | undefined,
  contentType: string | string[] | null | undefined,
): Record<string, unknown> | null {
  if (!body || body.length === 0) return null

  const normalizedContentTypeValue = Array.isArray(contentType) ? contentType[0] || '' : contentType || ''
  const normalizedContentType = normalizedContentTypeValue.toLowerCase()
  const bodySummary: Record<string, unknown> = {
    contentType: normalizedContentTypeValue || 'unknown',
    sizeBytes: body.length,
  }

  // 图片生成接口的响应体常带数 MB base64，直接跳过解析，只保留体积信息。
  if (body.length > LOG_BODY_PARSE_LIMIT) {
    bodySummary.preview = `[body omitted: ${body.length} bytes exceeds limit ${LOG_BODY_PARSE_LIMIT}]`
    return bodySummary
  }

  const shouldReadAsText =
    !normalizedContentType ||
    normalizedContentType.includes('application/json') ||
    normalizedContentType.startsWith('text/') ||
    normalizedContentType.includes('application/x-www-form-urlencoded')

  if (!shouldReadAsText) {
    bodySummary.preview = '[binary body omitted]'
    return bodySummary
  }

  const text = new TextDecoder().decode(body)
  const jsonPayload = tryParseJson(text)
  if (jsonPayload !== undefined) {
    bodySummary.json = sanitizeLogValue(jsonPayload)
    return bodySummary
  }

  bodySummary.preview = summarizeLogString(
    text.length > LOG_TEXT_PREVIEW_LIMIT
      ? `${text.slice(0, LOG_TEXT_PREVIEW_LIMIT)}...[truncated ${text.length - LOG_TEXT_PREVIEW_LIMIT} chars]`
      : text,
  )
  return bodySummary
}
