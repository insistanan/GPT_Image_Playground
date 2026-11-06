import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '@/store/taskParams'
import { DEFAULT_SETTINGS } from '@/types'
import { clampOutputImageCount, getImageModelCapabilities, normalizeParamsForSettings } from '@/lib/capabilities/paramCompatibility'

describe('paramCompatibility', () => {
  it('clamps n to 10', () => {
    expect(clampOutputImageCount(20)).toBe(10)
    expect(normalizeParamsForSettings({ ...DEFAULT_PARAMS, n: 20 }, DEFAULT_SETTINGS).n).toBe(10)
  })

  it('keeps xhigh and max for gpt-image-2.5 models', () => {
    const settings = { ...DEFAULT_SETTINGS, model: 'gpt-image-2.5-sunburst' }
    expect(getImageModelCapabilities(settings.model).supportsXHighQuality).toBe(true)
    expect(normalizeParamsForSettings({ ...DEFAULT_PARAMS, quality: 'xhigh' }, settings).quality).toBe('xhigh')
    expect(normalizeParamsForSettings({ ...DEFAULT_PARAMS, quality: 'max' }, settings).quality).toBe('max')
  })

  it('falls back to high for older image models', () => {
    const settings = { ...DEFAULT_SETTINGS, model: 'gpt-image-2' }
    expect(normalizeParamsForSettings({ ...DEFAULT_PARAMS, quality: 'max' }, settings).quality).toBe('high')
  })

  it('switches transparent jpeg to png', () => {
    const next = normalizeParamsForSettings({
      ...DEFAULT_PARAMS,
      background: 'transparent',
      output_format: 'jpeg',
      output_compression: 80,
    }, DEFAULT_SETTINGS)
    expect(next.output_format).toBe('png')
    expect(next.output_compression).toBe(null)
    expect(next.background).toBe('transparent')
  })

  it('clears input_fidelity when there are no input images', () => {
    const next = normalizeParamsForSettings({
      ...DEFAULT_PARAMS,
      input_fidelity: 'high',
    }, DEFAULT_SETTINGS, { hasInputImages: false })
    expect(next.input_fidelity).toBe(null)
  })

  it('clears compression and clamps gif frame params', () => {
    const baseParams = { ...DEFAULT_PARAMS, output_format: 'gif' as const }

    const imagesNext = normalizeParamsForSettings({
      ...baseParams,
      output_compression: 80,
      frame_count: 1,
      frame_duration_ms: 5000,
    }, DEFAULT_SETTINGS)
    expect(imagesNext.output_compression).toBe(null)
    expect(imagesNext.frame_count).toBe(2)
    expect(imagesNext.frame_duration_ms).toBe(5000)

    const responsesNext = normalizeParamsForSettings({
      ...baseParams,
      frame_count: 99,
      frame_duration_ms: 5000,
    }, { ...DEFAULT_SETTINGS, apiProtocol: 'responses' })
    expect(responsesNext.frame_count).toBe(16)
    expect(responsesNext.frame_duration_ms).toBe(2000)
  })

  it('clears gif frame params for non-gif output', () => {
    const next = normalizeParamsForSettings({
      ...DEFAULT_PARAMS,
      output_format: 'webp',
      frame_count: 9,
      frame_duration_ms: 200,
    }, DEFAULT_SETTINGS)
    expect(next.frame_count).toBe(null)
    expect(next.frame_duration_ms).toBe(null)
  })
})
