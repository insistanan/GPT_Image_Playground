import type { TaskBackground, TaskQuality } from '@/types'
import {
  BASE_QUALITY_VALUES,
  DEFAULT_GIF_FRAME_COUNT,
  DEFAULT_GIF_FRAME_DURATION_MS,
  GPT_IMAGE_25_QUALITY_VALUES,
  MAX_GIF_FRAME_COUNT,
  MAX_RESPONSES_GIF_FRAME_DURATION_MS,
  MIN_GIF_FRAME_COUNT,
  MIN_GIF_FRAME_DURATION_MS,
} from '@/lib/capabilities'

export interface ProviderOption {
  label: string
  value: string
}

export const QUALITY_OPTIONS = BASE_QUALITY_VALUES.map((value) => ({
  label: value,
  value,
}))

export const GPT_IMAGE_25_QUALITY_OPTIONS = GPT_IMAGE_25_QUALITY_VALUES.map((value) => ({
  label: value,
  value,
}))

export const BACKGROUND_OPTIONS: Array<{ label: string; value: TaskBackground }> = [
  { label: 'auto', value: 'auto' },
  { label: '不透明', value: 'opaque' },
  { label: '透明', value: 'transparent' },
]

export const INPUT_FIDELITY_OPTIONS = [
  { label: '默认', value: '' },
  { label: 'high', value: 'high' },
  { label: 'low', value: 'low' },
] as const

export const OUTPUT_FORMAT_OPTIONS = [
  { label: 'PNG', value: 'png' },
  { label: 'JPEG', value: 'jpeg' },
  { label: 'WebP', value: 'webp' },
  { label: 'GIF', value: 'gif' },
] as const

/** 选中 GIF 时填入的建议值；与官方默认一致，用户仍可清空改为跟随上游。 */
export const GIF_FRAME_DEFAULTS = {
  frameCount: DEFAULT_GIF_FRAME_COUNT,
  frameDurationMs: DEFAULT_GIF_FRAME_DURATION_MS,
} as const

export const GIF_FRAME_COUNT_HINT = `可选 ${MIN_GIF_FRAME_COUNT}–${MAX_GIF_FRAME_COUNT} 帧`
export const GIF_FRAME_DURATION_HINT = `至少 ${MIN_GIF_FRAME_DURATION_MS} 毫秒；Responses 不超过 ${MAX_RESPONSES_GIF_FRAME_DURATION_MS} 毫秒`

export const MODERATION_OPTIONS = [
  { label: 'auto', value: 'auto' },
  { label: 'low', value: 'low' },
] as const

export function getQualityOptions(supportsXHighQuality: boolean): Array<{ label: string; value: TaskQuality }> {
  return supportsXHighQuality ? GPT_IMAGE_25_QUALITY_OPTIONS : QUALITY_OPTIONS
}
