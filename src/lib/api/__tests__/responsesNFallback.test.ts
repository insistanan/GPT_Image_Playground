import { describe, expect, it } from 'vitest'
import { isUnsupportedOutputCountError, shouldBlockConcurrentNFallback } from '../requestPlanner'

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
