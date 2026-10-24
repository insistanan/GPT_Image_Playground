import { describe, expect, it } from 'vitest'
import { calculateImageSize, isExperimentalImageSize, normalizeImageSize } from './size'

describe('size presets', () => {
  it('uses 1280x720 for 1K 16:9', () => {
    expect(calculateImageSize('1K', '16:9')).toBe('1280x720')
  })

  it('uses 2560x1440 for 2K 16:9', () => {
    expect(calculateImageSize('2K', '16:9')).toBe('2560x1440')
  })

  it('marks sizes above 2560x1440 as experimental', () => {
    expect(isExperimentalImageSize('2560x1440')).toBe(false)
    expect(isExperimentalImageSize('3840x2160')).toBe(true)
  })

  it('keeps auto sizes untouched', () => {
    expect(normalizeImageSize('auto')).toBe('auto')
  })
})
