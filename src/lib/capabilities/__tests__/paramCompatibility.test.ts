import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../../../store/taskParams'
import { DEFAULT_SETTINGS } from '../../../types'
import { clampOutputImageCount, getImageModelCapabilities, normalizeParamsForSettings } from '../paramCompatibility'

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
})
