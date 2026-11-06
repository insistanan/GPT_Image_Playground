import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '@/store/taskParams'
import { DEFAULT_SETTINGS } from '@/types'
import { appendSafetyIdentifier, appendSharedImageParams } from '@/lib/api/sharedImageParams'

describe('appendSharedImageParams', () => {
  it('sends complexity only when it has a value', () => {
    const withComplexity: Record<string, unknown> = {}
    appendSharedImageParams(withComplexity, { ...DEFAULT_PARAMS, complexity: 'high' })
    expect(withComplexity.complexity).toBe('high')

    const withoutComplexity: Record<string, unknown> = {}
    appendSharedImageParams(withoutComplexity, { ...DEFAULT_PARAMS, complexity: null })
    expect(withoutComplexity).not.toHaveProperty('complexity')
  })

  it('skips partial_images for gif and svg output', () => {
    const gifBody: Record<string, unknown> = {}
    appendSharedImageParams(gifBody, { ...DEFAULT_PARAMS, output_format: 'gif' }, { stream: true })
    expect(gifBody).not.toHaveProperty('partial_images')

    const svgBody: Record<string, unknown> = {}
    appendSharedImageParams(svgBody, { ...DEFAULT_PARAMS, output_format: 'svg' }, { stream: true })
    expect(svgBody).not.toHaveProperty('partial_images')

    const pngBody: Record<string, unknown> = {}
    appendSharedImageParams(pngBody, DEFAULT_PARAMS, { stream: true })
    expect(pngBody.partial_images).toBe(1)
  })

  it('honors configured partial_images and clamps to 0-3', () => {
    const three: Record<string, unknown> = {}
    appendSharedImageParams(three, DEFAULT_PARAMS, { stream: true, partialImages: 3 })
    expect(three.partial_images).toBe(3)

    const zero: Record<string, unknown> = {}
    appendSharedImageParams(zero, DEFAULT_PARAMS, { stream: true, partialImages: 0 })
    expect(zero.partial_images).toBe(0)

    const overflow: Record<string, unknown> = {}
    appendSharedImageParams(overflow, DEFAULT_PARAMS, { stream: true, partialImages: 9 })
    expect(overflow.partial_images).toBe(3)
  })
})

describe('appendSafetyIdentifier', () => {
  it('sends the trimmed identifier only when configured', () => {
    const body: Record<string, unknown> = {}
    appendSafetyIdentifier(body, { ...DEFAULT_SETTINGS, safetyIdentifier: '  user-123  ' })
    expect(body.safety_identifier).toBe('user-123')

    const emptyBody: Record<string, unknown> = {}
    appendSafetyIdentifier(emptyBody, { ...DEFAULT_SETTINGS, safetyIdentifier: '   ' })
    expect(emptyBody).not.toHaveProperty('safety_identifier')
  })
})
