import type { AppSettings, TaskBackground, TaskInputFidelity, TaskParams, TaskQuality } from '@/types'
import { getImageGenerationModel, isGptImage25Model } from './imageModels'
import { normalizeImageSize } from '@/lib/size'

export const MAX_OPENAI_OUTPUT_IMAGES = 10
export const DEFAULT_STREAM_PARTIAL_IMAGES = 1

export const BASE_QUALITY_VALUES = ['auto', 'low', 'medium', 'high'] as const
export const GPT_IMAGE_25_QUALITY_VALUES = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export const BACKGROUND_VALUES = ['auto', 'opaque', 'transparent'] as const
export const INPUT_FIDELITY_VALUES = ['high', 'low'] as const

const FALLBACK_SIZE = 'auto'
const FALLBACK_QUALITY: TaskQuality = 'auto'
const FALLBACK_BACKGROUND: TaskBackground = 'auto'
const FALLBACK_N = 1

export interface ImageModelCapabilities {
  qualities: readonly TaskQuality[]
  backgrounds: readonly TaskBackground[]
  maxOutputImages: number
  supportsXHighQuality: boolean
  supportsTransparentBackground: boolean
}

export function getImageModelCapabilities(model: string): ImageModelCapabilities {
  const supportsXHighQuality = isGptImage25Model(model)
  return {
    qualities: supportsXHighQuality ? GPT_IMAGE_25_QUALITY_VALUES : BASE_QUALITY_VALUES,
    backgrounds: BACKGROUND_VALUES,
    maxOutputImages: MAX_OPENAI_OUTPUT_IMAGES,
    supportsXHighQuality,
    supportsTransparentBackground: true,
  }
}

export function getOutputImageLimitForSettings(
  settings: Pick<AppSettings, 'apiProtocol' | 'model' | 'responsesImageModel'>,
): number {
  return getImageModelCapabilities(getImageGenerationModel(settings)).maxOutputImages
}

export function clampOutputImageCount(n: number, limit = MAX_OPENAI_OUTPUT_IMAGES): number {
  if (!Number.isFinite(n)) return FALLBACK_N
  return Math.min(limit, Math.max(1, Math.round(n)))
}

export function isTaskQuality(value: unknown): value is TaskQuality {
  return (
    value === 'auto' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh' ||
    value === 'max'
  )
}

export function isTaskBackground(value: unknown): value is TaskBackground {
  return value === 'auto' || value === 'opaque' || value === 'transparent'
}

export function isTaskInputFidelity(value: unknown): value is TaskInputFidelity {
  return value === 'high' || value === 'low'
}

export function getChangedParams(current: TaskParams, next: TaskParams): Partial<TaskParams> {
  const patch: Partial<TaskParams> = {}
  for (const key of Object.keys(next) as Array<keyof TaskParams>) {
    if (current[key] !== next[key]) {
      ;(patch as Record<keyof TaskParams, TaskParams[keyof TaskParams]>)[key] = next[key]
    }
  }
  return patch
}

export function normalizeParamsForSettings(
  params: TaskParams,
  settings: Pick<AppSettings, 'apiProtocol' | 'model' | 'responsesImageModel'>,
  options: { hasInputImages?: boolean } = {},
): TaskParams {
  const capabilities = getImageModelCapabilities(getImageGenerationModel(settings))
  const nextParams: TaskParams = {
    ...params,
    size: normalizeImageSize(params.size) || FALLBACK_SIZE,
    quality: isTaskQuality(params.quality) ? params.quality : FALLBACK_QUALITY,
    background: isTaskBackground(params.background) ? params.background : FALLBACK_BACKGROUND,
    input_fidelity: isTaskInputFidelity(params.input_fidelity) ? params.input_fidelity : null,
    n: clampOutputImageCount(params.n, capabilities.maxOutputImages),
  }

  if ((nextParams.quality === 'xhigh' || nextParams.quality === 'max') && !capabilities.supportsXHighQuality) {
    nextParams.quality = 'high'
  }

  if (nextParams.output_format === 'png') {
    nextParams.output_compression = null
  }

  if (nextParams.background === 'transparent' && nextParams.output_format === 'jpeg') {
    nextParams.output_format = 'png'
    nextParams.output_compression = null
  }

  if (!options.hasInputImages) {
    nextParams.input_fidelity = null
  }

  return nextParams
}
