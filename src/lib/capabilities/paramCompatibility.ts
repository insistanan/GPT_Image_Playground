import type { AppSettings, TaskBackground, TaskComplexity, TaskInputFidelity, TaskParams, TaskQuality } from '@/types'
import { getImageGenerationModel, isGptImage25Model } from './imageModels'
import { normalizeImageSize } from '@/lib/size'

export const MAX_OPENAI_OUTPUT_IMAGES = 10
export const DEFAULT_STREAM_PARTIAL_IMAGES = 1
export const MIN_PARTIAL_IMAGES = 0
export const MAX_PARTIAL_IMAGES = 3

export const BASE_QUALITY_VALUES = ['auto', 'low', 'medium', 'high'] as const
export const GPT_IMAGE_25_QUALITY_VALUES = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export const BACKGROUND_VALUES = ['auto', 'opaque', 'transparent'] as const
export const INPUT_FIDELITY_VALUES = ['high', 'low'] as const

/** GIF 输出参数范围，与 Images / Responses 官方约束保持一致。 */
export const MIN_GIF_FRAME_COUNT = 2
export const MAX_GIF_FRAME_COUNT = 16
export const MIN_GIF_FRAME_DURATION_MS = 20
/** Responses 图片工具对每帧时长有上限，Images API 只限制下限。 */
export const MAX_RESPONSES_GIF_FRAME_DURATION_MS = 2000
export const DEFAULT_GIF_FRAME_COUNT = 9
export const DEFAULT_GIF_FRAME_DURATION_MS = 200

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

/** 流式预览帧数归一化：非法值退回默认值，合法值取整并夹到 0-3。 */
export function clampPartialImages(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_STREAM_PARTIAL_IMAGES
  }
  return Math.min(MAX_PARTIAL_IMAGES, Math.max(MIN_PARTIAL_IMAGES, Math.round(value)))
}

/**
 * GIF 帧参数归一化：空值保留“跟随上游默认值”，有值则取整并夹到合法区间。
 * 非 GIF 输出一律清空，避免把不适用的参数带到请求里。
 */
function normalizeGIFParams(
  params: TaskParams,
  responses: boolean,
): Pick<TaskParams, 'frame_count' | 'frame_duration_ms'> {
  if (params.output_format !== 'gif') {
    return { frame_count: null, frame_duration_ms: null }
  }

  const frameCount =
    typeof params.frame_count === 'number' && Number.isFinite(params.frame_count)
      ? Math.min(MAX_GIF_FRAME_COUNT, Math.max(MIN_GIF_FRAME_COUNT, Math.round(params.frame_count)))
      : null
  const maxDuration = responses ? MAX_RESPONSES_GIF_FRAME_DURATION_MS : Number.POSITIVE_INFINITY
  const frameDuration =
    typeof params.frame_duration_ms === 'number' && Number.isFinite(params.frame_duration_ms)
      ? Math.max(MIN_GIF_FRAME_DURATION_MS, Math.min(maxDuration, Math.round(params.frame_duration_ms)))
      : null

  return { frame_count: frameCount, frame_duration_ms: frameDuration }
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

export function isTaskComplexity(value: unknown): value is TaskComplexity {
  return value === 'low' || value === 'medium' || value === 'high'
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
    complexity: isTaskComplexity(params.complexity) ? params.complexity : null,
    n: clampOutputImageCount(params.n, capabilities.maxOutputImages),
    ...normalizeGIFParams(params, settings.apiProtocol === 'responses'),
  }

  if ((nextParams.quality === 'xhigh' || nextParams.quality === 'max') && !capabilities.supportsXHighQuality) {
    nextParams.quality = 'high'
  }

  if (nextParams.output_format === 'png' || nextParams.output_format === 'gif' || nextParams.output_format === 'svg') {
    nextParams.output_compression = null
  }

  // SVG 输出只支持单张、无压缩、无透明背景。
  if (nextParams.output_format === 'svg') {
    nextParams.n = 1
    if (nextParams.background === 'transparent') {
      nextParams.background = 'opaque'
    }
  }

  if (nextParams.background === 'transparent' && nextParams.output_format === 'jpeg') {
    nextParams.output_format = 'png'
    nextParams.output_compression = null
  }

  // 透明背景只支持 PNG/WebP，GIF 动图统一退回不透明，避免请求被上游拒绝。
  if (nextParams.background === 'transparent' && nextParams.output_format === 'gif') {
    nextParams.background = 'opaque'
  }

  if (!options.hasInputImages) {
    nextParams.input_fidelity = null
  }

  return nextParams
}
