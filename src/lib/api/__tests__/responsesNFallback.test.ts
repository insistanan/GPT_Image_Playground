import { afterEach, describe, expect, it, vi } from 'vitest'
import { isUnsupportedOutputCountError, shouldBlockConcurrentNFallback } from '@/lib/api/requestPlanner'
import { callResponsesApi } from '../responses'
import type { CallApiOptions, SharedRequestContext } from '../types'
import { DEFAULT_PARAMS, DEFAULT_SETTINGS } from '@/types'

describe('responses n fallback helpers', () => {
  it('detects unsupported n errors', () => {
    expect(isUnsupportedOutputCountError(new Error('Unknown parameter: n'))).toBe(true)
    expect(isUnsupportedOutputCountError(new Error('n is not supported'))).toBe(true)
    expect(isUnsupportedOutputCountError(Object.assign(new Error('invalid value for n'), { status: 400 }))).toBe(true)
    expect(isUnsupportedOutputCountError(new Error('internal server error'))).toBe(false)
  })

  it('blocks abort/auth/quota from concurrent fallback', () => {
    const abortError = new Error('任务已中止')
    abortError.name = 'AbortError'
    expect(shouldBlockConcurrentNFallback(abortError)).toBe(true)
    expect(shouldBlockConcurrentNFallback(new Error('invalid api key'))).toBe(true)
    expect(shouldBlockConcurrentNFallback(Object.assign(new Error('rate limited'), { status: 429 }))).toBe(true)
    expect(shouldBlockConcurrentNFallback(new Error('Unknown parameter: n'))).toBe(false)
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('Responses 多图降级调用链', () => {
  it('保留成功子请求的图片，并把另一个子请求失败返回给调用方', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Unknown parameter: n' } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        output: [{ id: 'img-1', type: 'image_generation_call', status: 'completed', result: 'aW1hZ2U=' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const onFinalImages = vi.fn()
    const opts: CallApiOptions = {
      settings: { ...DEFAULT_SETTINGS, baseUrl: 'https://example.com', apiProtocol: 'responses', responsesTransport: 'json' },
      params: { ...DEFAULT_PARAMS, n: 2 }, prompt: '测试', inputImageDataUrls: [], onFinalImages,
    }
    const ctx: SharedRequestContext = {
      controller: new AbortController(), refreshTimeout: vi.fn(), requestHeaders: {},
      proxyConfig: null, mime: 'image/png', forceProxy: false, debugLog: [],
    }
    await expect(callResponsesApi(opts, ctx)).rejects.toThrow('多图生成部分失败')
    expect(onFinalImages).toHaveBeenCalledTimes(1)
    expect(onFinalImages.mock.calls[0][0]).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
