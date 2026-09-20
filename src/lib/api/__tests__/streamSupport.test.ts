import { beforeEach, describe, expect, it } from 'vitest'
import type { AppSettings } from '../../../types'
import {
  buildStreamSupportKey,
  isStreamKnownUnsupported,
  isStreamUnsupportedError,
  markStreamUnsupported,
  resetStreamSupportCache,
} from '../streamSupport'

function fakeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    baseUrl: 'https://token.sensenova.cn',
    apiKey: 'sk-test',
    model: 'sensenova-u1.5-lite',
    responsesImageModel: 'gpt-image-2',
    responsesTransport: 'auto',
    responsesImageInputMode: 'auto',
    responsesPromptRevisionMode: 'allow',
    timeout: 900,
    apiProtocol: 'images',
    requestMode: 'direct',
    ...overrides,
  }
}

describe('isStreamUnsupportedError', () => {
  it('识别商汤的确定性拒绝', () => {
    expect(
      isStreamUnsupportedError(new Error('field Stream invalid, only false is allowed for this model')),
    ).toBe(true)
  })

  it('识别常见的“不支持流式”措辞', () => {
    expect(isStreamUnsupportedError(new Error('streaming is not supported'))).toBe(true)
    expect(isStreamUnsupportedError(new Error('this model does not support stream'))).toBe(true)
  })

  it('不把通用网络错误误判为能力缺失', () => {
    expect(isStreamUnsupportedError(new Error('fetch failed'))).toBe(false)
    expect(isStreamUnsupportedError(new Error('request timed out'))).toBe(false)
    expect(isStreamUnsupportedError('just a string')).toBe(false)
  })
})

describe('stream capability cache', () => {
  beforeEach(() => {
    resetStreamSupportCache()
  })

  it('按协议、baseUrl、模型区分目标', () => {
    const settings = fakeSettings()
    const imagesKey = buildStreamSupportKey(settings, 'images')
    const responsesKey = buildStreamSupportKey(settings, 'responses')

    expect(imagesKey).toContain('sensenova-u1.5-lite')
    expect(responsesKey).toContain('gpt-image-2')
    expect(imagesKey).not.toBe(responsesKey)
    expect(buildStreamSupportKey(fakeSettings({ model: 'other-model' }), 'images')).not.toBe(imagesKey)
  })

  it('记录后命中，重置后清空', () => {
    const key = buildStreamSupportKey(fakeSettings(), 'images')
    expect(isStreamKnownUnsupported(key)).toBe(false)

    markStreamUnsupported(key)
    expect(isStreamKnownUnsupported(key)).toBe(true)

    resetStreamSupportCache()
    expect(isStreamKnownUnsupported(key)).toBe(false)
  })
})
