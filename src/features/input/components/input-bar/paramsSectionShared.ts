import type { TaskBackground, TaskQuality } from '@/types'
import { BASE_QUALITY_VALUES, GPT_IMAGE_25_QUALITY_VALUES } from '@/lib/capabilities'

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
] as const

export const MODERATION_OPTIONS = [
  { label: 'auto', value: 'auto' },
  { label: 'low', value: 'low' },
] as const

export function getQualityOptions(supportsXHighQuality: boolean): Array<{ label: string; value: TaskQuality }> {
  return supportsXHighQuality ? GPT_IMAGE_25_QUALITY_OPTIONS : QUALITY_OPTIONS
}
