import { describe, expect, it } from 'vitest'
import { sanitizeDebugValue } from '../api/debug'
import {
  isSensitiveFieldName,
  LOG_BODY_PARSE_LIMIT,
  sanitizeLogValue,
  summarizeBody,
  summarizeHeaders,
  summarizeLogString,
  summarizeResponseHeaders,
} from '../logSanitize'

const textEncoder = new TextEncoder()

function encodeJson(payload: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(payload))
}

describe('summarizeString', () => {
  it('不会对超大 base64 执行全量正则导致栈溢出', () => {
    const base64 = 'A'.repeat(4 * 1024 * 1024)

    // 回归：旧实现用 /^[A-Za-z0-9+/=]{600,}$/ 扫描整串，会抛 RangeError。
    expect(() => summarizeLogString(base64)).not.toThrow()
    expect(summarizeLogString(base64)).toBe(`[base64 length=${base64.length}]`)
  })

  it('压缩 data URL 且不扫描内容', () => {
    const dataUrl = `data:image/png;base64,${'A'.repeat(5000)}`
    expect(summarizeLogString(dataUrl)).toBe(`[data-url mime=image/png length=${dataUrl.length}]`)
  })

  it('脱敏 Bearer token', () => {
    expect(summarizeLogString('Bearer sk-1234567890')).toBe('[REDACTED_BEARER_TOKEN]')
  })

  it('截断普通长文本', () => {
    const longText = '普通文本 with spaces '.repeat(2000)
    const summarized = summarizeLogString(longText)
    expect(summarized.length).toBeLessThan(longText.length)
    expect(summarized).toContain('...[truncated')
  })

  it('短文本保持原样', () => {
    expect(summarizeLogString('hello world')).toBe('hello world')
  })
})

describe('summarizeBody', () => {
  it('跳过超过阈值的超大响应体，不做 JSON 解析', () => {
    const body = encodeJson({ b64_json: 'A'.repeat(1024 * 1024) })
    expect(body.length).toBeGreaterThan(LOG_BODY_PARSE_LIMIT)

    const summary = summarizeBody(body, 'application/json')
    expect(summary?.sizeBytes).toBe(body.length)
    expect(summary?.json).toBeUndefined()
    expect(String(summary?.preview)).toContain('body omitted')
  })

  it('对阈值内的大 base64 字段做压缩而不栈溢出', () => {
    const base64 = 'A'.repeat(200 * 1024)
    const body = encodeJson({ b64_json: base64 })

    const summary = summarizeBody(body, 'application/json')
    const json = summary?.json as Record<string, unknown>
    expect(json.b64_json).toBe(`[base64 length=${base64.length}]`)
  })

  it('脱敏小 JSON 里的敏感字段', () => {
    const summary = summarizeBody(encodeJson({ api_key: 'secret-value', model: 'x' }), 'application/json')
    const json = summary?.json as Record<string, unknown>
    expect(json.api_key).toBe('[REDACTED]')
    expect(json.model).toBe('x')
  })

  it('非文本响应体只记录体积', () => {
    const summary = summarizeBody(new Uint8Array([1, 2, 3]), 'image/png')
    expect(summary?.preview).toBe('[binary body omitted]')
  })

  it('空 body 返回 null', () => {
    expect(summarizeBody(undefined, 'application/json')).toBeNull()
    expect(summarizeBody(new Uint8Array(), 'application/json')).toBeNull()
  })
})

describe('summarizeHeaders', () => {
  it('脱敏请求头里的凭据', () => {
    const result = summarizeHeaders({
      authorization: 'Bearer abc',
      cookie: 'session=1',
      'content-type': 'application/json',
    })

    expect(result.authorization).toBe('[REDACTED]')
    expect(result.cookie).toBe('[REDACTED]')
    expect(result['content-type']).toBe('application/json')
  })

  it('脱敏响应头里的凭据', () => {
    const result = summarizeResponseHeaders(
      new Headers({ authorization: 'Bearer abc', 'content-type': 'application/json' }),
    )

    expect(result.authorization).toBe('[REDACTED]')
    expect(result['content-type']).toBe('application/json')
  })
})

describe('sanitizeLogValue', () => {
  it('对超深嵌套结构有深度上限', () => {
    let node: unknown = { value: 1 }
    for (let index = 0; index < 200; index += 1) {
      node = { child: node }
    }

    const result = sanitizeLogValue(node)
    expect(JSON.stringify(result)).toContain('[max-depth-reached]')
  })

  it('对循环引用不会无限递归', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(() => sanitizeLogValue(cyclic)).not.toThrow()
  })

  it('数组超长时追加剩余数量提示', () => {
    const result = sanitizeLogValue(Array.from({ length: 25 }, (_, index) => index)) as unknown[]
    expect(result).toHaveLength(11)
    expect(result[10]).toBe('[+15 more items]')
  })
})

describe('isSensitiveFieldName', () => {
  it('识别常见凭据字段', () => {
    expect(isSensitiveFieldName('authorization')).toBe(true)
    expect(isSensitiveFieldName('x-api-key')).toBe(true)
    expect(isSensitiveFieldName('api_key')).toBe(true)
    expect(isSensitiveFieldName('content-type')).toBe(false)
  })
})

describe('前端调试日志复用共享实现', () => {
  it('sanitizeDebugValue 对超大 base64 payload 不栈溢出', () => {
    const base64 = 'A'.repeat(4 * 1024 * 1024)
    const payload = { created: 1, data: [{ b64_json: base64 }] }

    expect(() => sanitizeDebugValue(payload)).not.toThrow()
    expect(sanitizeDebugValue(payload)).toEqual({
      created: 1,
      data: [{ b64_json: `[base64 length=${base64.length}]` }],
    })
  })
})
